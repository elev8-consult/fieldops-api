import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
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

  private get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** Disabled in production; use a permanent login code for test accounts there. */
  private get devCode(): string | null {
    if (this.isProduction) return null;
    const c = this.config.get<string>('DEV_OTP_CODE');
    return c && c.trim() ? c.trim() : null;
  }

  /** The single phone allowed to bypass real OTP delivery (testing). */
  private get devPhone(): string | null {
    const p = this.config.get<string>('DEV_OTP_PHONE');
    return p && p.trim() ? this.normalizePhone(p) : null;
  }

  /** True only for the configured test phone when a dev code is set. */
  private isDevPhone(phone: string): boolean {
    return (
      this.devCode != null && this.devPhone != null && phone === this.devPhone
    );
  }

  private get ttlMinutes(): number {
    const n = parseInt(this.config.get<string>('OTP_TTL_MINUTES') ?? '5', 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  /** Only field roles sign in by phone; staff use email + password on the web. */
  private static readonly PHONE_LOGIN_ROLES = ['merchandiser', 'promoter'];

  private async findActiveUser(phone: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.loginCodeHash')
      .where('u.whatsapp_phone = :phone', { phone })
      .andWhere('u.is_active = true')
      .andWhere('u.role IN (:...roles)', {
        roles: OtpService.PHONE_LOGIN_ROLES,
      })
      .getOne();
  }

  private static readonly MAX_CODE_FAILURES = 10;
  private static readonly LOCK_MINUTES = 15;
  private static readonly MAX_OTP_ATTEMPTS = 6;
  private static readonly MAX_OTP_REQUESTS = 5;
  private static readonly OTP_REQUEST_WINDOW_MINUTES = 15;

  /** Check a user's permanent login code, locking after repeated failures. */
  private async verifyLoginCode(user: User, code: string): Promise<void> {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(
        'Too many attempts. Try again in 15 minutes.',
      );
    }
    const match = await bcrypt.compare(code, user.loginCodeHash ?? '');
    if (match) {
      if (user.failedLoginCount > 0 || user.lockedUntil) {
        await this.userRepo.update(user.id, {
          failedLoginCount: 0,
          lockedUntil: null,
        });
      }
      return;
    }
    // Single statement so parallel guesses cannot skip the lock.
    await this.userRepo.query(
      `UPDATE users
       SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0
                                     ELSE failed_login_count + 1 END,
           locked_until = CASE WHEN failed_login_count + 1 >= $2
                               THEN now() + make_interval(mins => $3)
                               ELSE locked_until END
       WHERE id = $1`,
      [user.id, OtpService.MAX_CODE_FAILURES, OtpService.LOCK_MINUTES],
    );
    throw new UnauthorizedException('Invalid or expired code');
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
    return String(randomInt(100000, 1000000));
  }

  // ── Delivery channels (best-effort; never throw to the caller) ──────────
  private async sendCode(phone: string, code: string): Promise<string> {
    if (await this.trySendWhatsApp(phone, code)) return 'whatsapp';
    if (await this.trySendSms(phone, code)) return 'sms';
    if (this.isProduction) {
      this.logger.error(
        `No OTP channel configured; code for ${phone} was not delivered`,
      );
    } else {
      this.logger.warn(
        `No OTP channel configured — code for ${phone} is ${code} (dev only)`,
      );
    }
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

    // Test phone: skip delivery entirely, the fixed dev code is accepted.
    if (this.isDevPhone(phone)) {
      const existing = await this.findActiveUser(phone);
      if (!existing) await this.provisionTestMerchandiser(phone);
      return { channel: 'dev' };
    }

    const user = await this.findActiveUser(phone);
    if (!user) {
      // Number is not registered — never auto-create, never reveal.
      return { channel: null };
    }

    // Users with a permanent login code already know it — nothing to send.
    if (user.loginCodeHash) {
      return { channel: 'static' };
    }

    const recent: Array<{ n: number }> = await this.otpRepo.query(
      `SELECT COUNT(*)::int AS n FROM auth_otp
       WHERE phone = $1 AND created_at > now() - make_interval(mins => $2)`,
      [phone, OtpService.OTP_REQUEST_WINDOW_MINUTES],
    );
    if ((recent[0]?.n ?? 0) >= OtpService.MAX_OTP_REQUESTS) {
      throw new HttpException(
        'Too many codes requested. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);

    // Only the newest code is valid, so requesting again cannot reset attempts.
    await this.otpRepo.update(
      { phone, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

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

    return { channel };
  }

  async verifyOtp(rawPhone: string, code: string): Promise<OtpVerifyResult> {
    const phone = this.normalizePhone(rawPhone);
    let user = await this.findActiveUser(phone);

    const masterOk = this.isDevPhone(phone) && code === this.devCode;

    if (masterOk) {
      if (!user) user = await this.provisionTestMerchandiser(phone);
    } else if (user?.loginCodeHash) {
      await this.verifyLoginCode(user, code);
    } else {
      if (!user) throw new UnauthorizedException('Invalid or expired code');

      const row = await this.otpRepo.findOne({
        where: { phone, consumedAt: IsNull() },
        order: { createdAt: 'DESC' },
      });
      if (!row) throw new UnauthorizedException('Invalid or expired code');

      // TypeORM returns [rows, rowCount] for UPDATE ... RETURNING on Postgres.
      const [bumped] = await this.otpRepo.query<
        [{ attempts: number }[], number]
      >(
        `UPDATE auth_otp SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
        [row.id],
      );
      const attempts = bumped[0]?.attempts ?? row.attempts + 1;

      if (attempts > OtpService.MAX_OTP_ATTEMPTS) {
        throw new UnauthorizedException(
          'Too many attempts. Request a new code.',
        );
      }
      if (row.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('That code has expired.');
      }
      const match = await bcrypt.compare(code, row.codeHash);
      if (!match) throw new UnauthorizedException('Invalid or expired code');

      const consumed = await this.otpRepo.update(
        { id: row.id, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      if (!consumed.affected) {
        throw new UnauthorizedException('Invalid or expired code');
      }
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
