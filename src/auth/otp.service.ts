import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Otp } from './entities/otp.entity';

export interface OtpVerifyResult {
  access_token: string;
  user: {
    id: string;
    fullName: string | null;
    email: string;
    role: string;
    brandId: string | null;
  };
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectRepository(Otp) private readonly otpRepo: Repository<Otp>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ── Phone normalization (Lebanon-friendly, digits only, E.164 without +) ──
  private normalizePhone(raw: string): string {
    let d = (raw ?? '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '961' + d.slice(1);
    else if (d.length <= 8) d = '961' + d;
    return d;
  }

  private get devCode(): string | null {
    const c = this.config.get<string>('DEV_OTP_CODE');
    return c && c.trim() ? c.trim() : null;
  }

  private get ttlMinutes(): number {
    const n = parseInt(this.config.get<string>('OTP_TTL_MINUTES') ?? '5', 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  private async findActiveUser(phone: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { whatsappPhone: phone, isActive: true },
    });
  }

  /** Dev/testing convenience: provision a merchandiser for an unknown phone. */
  private async provisionTestMerchandiser(phone: string): Promise<User> {
    const email = `m_${phone}@fieldops.local`;
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) return existing;
    const user = this.userRepo.create({
      fullName: `Field User ${phone.slice(-4)}`,
      whatsappPhone: phone,
      email,
      passwordHash: null,
      role: 'merchandiser',
      brandId: null,
      isActive: true,
      approvalStatus: 'approved',
    });
    return this.userRepo.save(user);
  }

  private generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ── Delivery channels (best-effort; never throw to the caller) ──────────
  private async sendCode(phone: string, code: string): Promise<string> {
    if (await this.trySendWhatsApp(phone, code)) return 'whatsapp';
    if (await this.trySendSms(phone, code)) return 'sms';
    this.logger.warn(
      `No OTP channel configured — code for ${phone} is ${code} (dev only)`,
    );
    return 'dev';
  }

  private async trySendWhatsApp(phone: string, code: string): Promise<boolean> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneId) return false;
    const template = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME');
    const lang = this.config.get<string>('WHATSAPP_OTP_LANG') ?? 'en_US';
    try {
      const body = template
        ? {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: template,
              language: { code: lang },
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: `Your FieldOps verification code is ${code}` },
          };
      await axios.post(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        body,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
      );
      return true;
    } catch (e) {
      this.logger.warn(`WhatsApp OTP send failed: ${this.errText(e)}`);
      return false;
    }
  }

  private async trySendSms(phone: string, code: string): Promise<boolean> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM');
    if (!sid || !token || !from) return false;
    try {
      const params = new URLSearchParams({
        To: `+${phone}`,
        From: from,
        Body: `Your FieldOps verification code is ${code}`,
      });
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        params,
        { auth: { username: sid, password: token }, timeout: 8000 },
      );
      return true;
    } catch (e) {
      this.logger.warn(`Twilio SMS send failed: ${this.errText(e)}`);
      return false;
    }
  }

  private errText(e: unknown): string {
    if (axios.isAxiosError(e)) {
      return JSON.stringify(e.response?.data ?? e.message);
    }
    return e instanceof Error ? e.message : 'unknown';
  }

  // ── Public API ──────────────────────────────────────────────────────────
  async requestOtp(rawPhone: string): Promise<{ channel: string | null }> {
    const phone = this.normalizePhone(rawPhone);
    let user = await this.findActiveUser(phone);

    if (!user) {
      if (this.devCode) {
        user = await this.provisionTestMerchandiser(phone);
      } else {
        // Don't reveal whether the number is registered.
        return { channel: null };
      }
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const channel = await this.sendCode(phone, code);

    await this.otpRepo.save(
      this.otpRepo.create({
        phone,
        codeHash,
        channel,
        attempts: 0,
        expiresAt: new Date(Date.now() + this.ttlMinutes * 60_000),
      }),
    );

    if (this.devCode) {
      this.logger.log(
        `DEV mode: master code ${this.devCode} works for any phone (generated code for ${phone}: ${code})`,
      );
    }

    return { channel };
  }

  async verifyOtp(rawPhone: string, code: string): Promise<OtpVerifyResult> {
    const phone = this.normalizePhone(rawPhone);
    let user = await this.findActiveUser(phone);

    const masterOk = this.devCode != null && code === this.devCode;

    if (masterOk) {
      if (!user) user = await this.provisionTestMerchandiser(phone);
    } else {
      if (!user) throw new UnauthorizedException('Invalid or expired code');

      const row = await this.otpRepo.findOne({
        where: { phone, consumedAt: IsNull() },
        order: { createdAt: 'DESC' },
      });
      if (!row) throw new UnauthorizedException('Invalid or expired code');

      row.attempts += 1;
      await this.otpRepo.save(row);

      if (row.attempts > 6) {
        throw new UnauthorizedException('Too many attempts. Request a new code.');
      }
      if (row.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('That code has expired.');
      }
      const match = await bcrypt.compare(code, row.codeHash);
      if (!match) throw new UnauthorizedException('Invalid or expired code');

      row.consumedAt = new Date();
      await this.otpRepo.save(row);
    }

    if (!user) throw new UnauthorizedException('Invalid or expired code');

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      brandId: user.brandId,
    };
    const access_token = await this.jwt.signAsync(payload);

    return {
      access_token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        brandId: user.brandId,
      },
    };
  }
}
