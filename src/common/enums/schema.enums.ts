export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  BRAND_MANAGER = 'brand_manager',
  SUPERVISOR = 'supervisor',
  PROMOTER = 'promoter',
  MERCHANDISER = 'merchandiser',
  REVIEWER = 'reviewer',
}

export enum OutletType {
  SUPERMARKET = 'supermarket',
  MINIMARKET = 'minimarket',
  HYPERMARKET = 'hypermarket',
  DEPOT = 'depot',
  OTHER = 'other',
}

export enum ProductFlow {
  MERCHANDISER = 'merchandiser',
  PROMOTER = 'promoter',
  BOTH = 'both',
}

export enum MessageStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  PARSED = 'parsed',
  FLAGGED = 'flagged',
  REVIEWED = 'reviewed',
  REJECTED = 'rejected',
  DUPLICATE = 'duplicate',
}

export enum ReportType {
  MERCHANDISER = 'merchandiser',
  PROMOTER = 'promoter',
  UNKNOWN = 'unknown',
}

export enum ParsedReportStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum FlagSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum FlagStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  IGNORED = 'ignored',
}
