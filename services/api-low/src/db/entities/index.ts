import { AuthSessionEntity, OtpChallengeEntity, OtpCooldownEntity, RateLimitCounterEntity, RefreshTokenEntity } from './auth.entities';
import { DeadLetterEventEntity, InboxBroadcastEntity, InboxEventEntity, InboxMessageEntity, OutboxEventEntity } from './messaging.entities';
import { BadgeCatalogEntity, SettingsCacheEntity } from './settings.entity';
import { ProfileEntity, UserClaimsEntity, UserCredentialEntity, UserEntity } from './user.entities';

export * from './auth.entities';
export * from './messaging.entities';
export * from './settings.entity';
export * from './user.entities';

export const ENTITIES = [
  UserEntity,
  UserCredentialEntity,
  ProfileEntity,
  UserClaimsEntity,
  OtpChallengeEntity,
  AuthSessionEntity,
  RefreshTokenEntity,
  SettingsCacheEntity,
  RateLimitCounterEntity,
  InboxMessageEntity,
  OutboxEventEntity,
  InboxEventEntity,
  OtpCooldownEntity,
  InboxBroadcastEntity,
  DeadLetterEventEntity,
  BadgeCatalogEntity
];
