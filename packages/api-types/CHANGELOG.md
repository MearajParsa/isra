# Changelog — @isra/api-types

فرمت: [Keep a Changelog](https://keepachangelog.com/fa/1.1.0/)؛ نسخه‌گذاری: [SemVer](https://semver.org/lang/fa/) روی قرارداد (جزئیات: `docs-v2/22-api-engineering-standards.md` §۵).

## [1.7.0] — ۱۴۰۵/۰۷/۱۷
> جزئیات رفتاری: docs-v2/31. **این نسخه تغییر ناسازگار دارد** (نقش‌های جلسه، بدنهٔ ارزیابی، تنظیمات) ولی با تصمیم مالک روی همان `v1` منتشر می‌شود:
> هر سه سرویس و کلاینت‌های `web-main` و `web-admin` **در همین انتشار** به‌روز می‌شوند (ترتیب استقرار: low ← mid ← high؛ docs-v2/31 §۷). Android در فاز بعد.

### ناسازگار (breaking)
- **نقش جلسه:** `SessionRole` = `owner | supporter | member` (جایگزین `session_manager | session_supporter | teacher | quran_student`). `StaffAssignableRole` حذف شد.
- **مجوزهای جلسه:** `SessionPermission` = `membership.approve`، `membership.manage`، `attendance.manage`، `queue.manage`، `eval.submit`، `gallery.manage`، `comment.moderate`، `occurrence.manage`، `session.edit` (حذف: `session.transition` ⇒ `session.edit`، `membership.roles`، `attendance.view` ⇒ صاحب/پشتیبان). `SESSION_ROLE_PERMISSIONS` ⇒ `SESSION_DELEGABLE_PERMISSIONS` (با عنوان فارسی؛ صاحب = همه).
- **حذف endpoint:** M-13 (نقش عضو)، M-16 (مدیر جلسه)، H-68 (نقش عضو/هم‌مدیر). **H-74** ⇒ `PUT /system/sessions/{id}/owner` با `TransferOwnerBody {userId, previousOwner: supporter|remove}` (جایگزین `/manager` و `TransferManagerBody`).
- **عضویت فقط عضو:** `AddMembersBody` (M-14) و `AdminAddMembersBody` (H-73) بدون `roles`/`defaultRoles`/`onExisting`؛ `CreateInviteBody`/`Invite` بدون `roles`؛ `Member`/`RosterItem` بدون `roles`؛ فیلتر `role` از M-11/M-18/H-66 حذف؛ `AddMemberOutcome` بدون `merged`/`replaced`.
- **نمای من:** `SessionMe` ⇒ `role` (owner/supporter/member/null) + `membership {status}`؛ `evalWeights` حذف (⇒ M-45). `MySessionItem` ⇒ `role` + `membership` nullable. `UserMembership` (H-52) ⇒ `role`، `memberId`/`status`/`requestedAt` nullable.
- **ارزیابی پویا:** `EvaluationBody`/`EvaluationPatchBody`/`AdminEvaluationPatchBody` ⇒ `scores: [{criterionId, score}]` (به‌جای voice/tone/tajweed)؛ پاسخ `Evaluation` ⇒ `criteria: [{criterionId,key,title,weight,maxScore,score}]` (snapshot) به‌جای `voice`/`tone`/`tajweed`/`weights`. `EvaluationWeights` حذف.
- **تنظیمات:** `SystemSettings`/`UpdateSettingsBody` بدون `evalWeights` و `badgeThresholds` (بدنهٔ strict ⇒ ارسال آن‌ها VALIDATION_FAILED)؛ `SystemEvalWeights` حذف.
- **H-48** ⇒ کاتالوگ مجوزهای قابل‌واگذاری (`SessionPermissionCatalog`؛ جایگزین `SessionRolesMatrix`).
- `AdminSession.counts.managers` ⇒ `counts.supporters`؛ + `owner {id,name}`.
- internal: `MID_ADMIN.memberRoles`، `MID_ADMIN.manager`، `MidAdminSetRoles`، `MidAdminManager(Result)` حذف ⇒ `MID_ADMIN.owner` + `MidAdminOwner(Result)`؛ `MidAdminAddMembers` بدون roles/onExisting؛ `MidAdminEvaluationPatch` با `scores`.

### افزوده شد
- **mid:** M-45 معیارهای فعال؛ M-60..M-63 پشتیبان ثابت استاد؛ M-64..M-67 پشتیبان per جلسه؛ M-68 کاتالوگ مجوزها؛ M-70..M-77 گالری per نوبت (بارگذاری خام، محتوا با Range)؛ M-78/M-79 گالری public برای مهمان (`/public/`، بی‌توکن، cache عمومی)؛ M-80..M-83 کامنت (حین تلاوت/عمومی نوبت).
- **high:** H-100..H-103 معیارهای ارزیابی؛ H-104..H-109 پشتیبان‌ها؛ H-110..H-117 گالری (بارگذاری/محتوا stream به/از mid)؛ H-118..H-120 کامنت.
- **سطح‌ها:** `Tier` (`high|mid|low`) روی `SystemRole`/`ModuleInfo`/`CreateRoleBody`/`CreateModuleBody`؛ فیلتر `tier` در H-10/H-88؛ `SystemRole.implicit`؛ `SystemMe.tiers`، `EffectiveAccess.tiers`، منبع دسترسی `baseline`. مدیریت نقش per سطح (H-12/H-13/H-15..H-18 با `permissionAny`: `system.roles.mid.manage`، `system.roles.low.manage`).
- `SessionInput`/`MidSession`: `commentsEnabled` (پیش‌فرض true)، `commentVisibility` (`public|reciter_only`، پیش‌فرض public).
- schemaها: `EvaluationCriterion`، `EvaluationCriteriaList`، `ActiveCriteria`، `EvaluationCriterionScore`، `TeacherSupporter`، `SessionSupporter`، `Gallery`، `GalleryItem`، `PublicGallery`، `Comment` و بدنه‌های مربوط.
- `EndpointDef`: `rawBody {contentTypes, maxBytes}` (OpenAPI: requestBody باینری + `x-isra-max-body-bytes`)، `rangeRequests` (پارامتر `Range`، پاسخ 206، `x-isra-range`)، `permissionAny` (`x-isra-permission-any`). پاسخ خام غیرمتنی ⇒ `format: binary`.
- Socket.IO: `comment.created` (فقط سوکت‌های مجاز)، `comment.updated`، `gallery.updated`، `supporters.updated`.
- L-30/L-31: نیازمند `session.browse` مؤثر (baseline مهمان).
- دلایل CONFLICT: `ALREADY_SUPPORTER`، `CRITERION_IN_USE`، `LAST_ACTIVE_CRITERION`، `GALLERY_KIND_MISMATCH`، `QUOTA_EXCEEDED`، `NOT_RECITING`، `COMMENTS_DISABLED`. `AuditTargetType` += criterion، supporter، gallery، comment.
- internal: MID_ADMIN (`owner`، `sessionOwners`، `teacherSupporters`/`teacherSupporter`، `supporters`/`supporter`، `galleries`/`gallery`/`galleryItems`/`galleryItem`/`galleryItemContent`، `comments`/`comment`)؛ رویدادهای `evaluation.criteria.changed` (high ⇒ mid) و `tier.baseline.changed` (high ⇒ low، mid).

## [1.6.0] — ۱۴۰۵/۰۷/۱۵
### افزوده شد (سازگار؛ جزئیات docs-v2/30)
- **عضویت کامل جلسه:** افزودن مستقیم عضو با شناسه یا شماره و نقش (M-14، H-73 تا ۲۰۰ نفر با createMissing)، حذف عضو توسط کادر (M-15)، اعطا/انتقال مدیر (M-16، H-74، H-68 با هم‌مدیر)، ترک جلسه (M-17)، تأیید گروهی (H-53)، دعوت با کد (M-50..M-53)، سیاست پیوستن/نمایش/ظرفیت در SessionInput.
- **نوبت برگزاری (occurrence):** حضور/صف/ارزیابی per نوبت (M-08، M-09، M-19، H-75)؛ +۵ حضور یک‌بار per نوبت.
- **حضور و صف توسط کادر/ادمین:** M-18 حضور و غیاب، M-22/H-76 ثبت حضور، M-23/H-77 لغو حضور، M-35 قرار دادن در صف، H-78/H-79 مدیریت صف.
- **ارزیابی:** ویرایش (M-43/H-96) و باطل‌کردن (M-44/H-95).
- **امتیاز و نشان پویا:** دفتر امتیاز (M-46، L-23، H-97)، اصلاح دستی (H-98)، نشان‌های قابل مدیریت با تصویر (H-32..H-37، L-33، L-34)؛ امتیاز می‌تواند کم شود و نشان پس گرفته شود (تصمیم مالک).
- **پیام همگانی:** H-41/H-42/H-46 (اینباکس؛ همه/کاربران/نقش/اعضای جلسه).
- **خروجی CSV سمت سرور:** H-43/H-44/H-45. **ماتریس نقش جلسه:** H-48. **تاریخچهٔ عضویت کاربر:** H-52.
- **low:** حذف حساب توسط خود کاربر (L-22)، حذف پیام اینباکس (L-28)، پیکربندی عمومی (L-32)؛ InboxKind += announcement، session.
- **کشف جلسه:** M-06؛ حذف draft توسط مدیر: M-07.
- دلایل CONFLICT تازه/اعلام‌نشدهٔ قبلی؛ `PersonName` نویسه‌های جهت‌دهی/کنترلی را رد می‌کند (نیم‌فاصله مجاز).
- internal: LOW_INTERNAL.resolveUsers، LOW_ADMIN.usersBulk/broadcast، MID_ADMIN (۱۴ مسیر تازه)، HIGH_INTERNAL.badgeImage، MID_FOR_LOW.pointsLedger؛ رویدادهای inbox.messages.created، inbox.broadcast.created، badge.catalog.changed، points.changed.
### تغییر رفتار (با default سازگار)
- `PointsSummary.badges` پویا (نه ۴ تایی ثابت)؛ `SystemSettings.badgeThresholds` منسوخ.

## [1.5.0] — ۱۴۰۵/۰۷/۱۴
### افزوده شد
- **RBAC پویا:** نقش، مجوز و ماژول قابل ساخت/ویرایش/حذف (H-13..H-18، H-85..H-91)؛ ماتریس یک‌جا H-92؛ دسترسی مؤثر H-93/H-94؛ step-up per نقش×مجوز؛ developer از step-up معاف.
- مجوزهای سیستمی تازه: `system.role.manage`، `system.permission.manage`، `system.stepup.manage`.
- تغییر شکل (سازگار با کلاینت‌های فعلی): `SystemRoleKey`/`PermissionKey`/`Grant` از enum به string با الگو؛ `SystemRole` فیلدهای `modules`/`effectivePermissions`/`stepUpRules` گرفت؛ `PermissionInfo` فیلد `group` را به `moduleKey` و … تغییر داد؛ `SystemMe.stepUpExempt`/`stepUp`.
- دلایل CONFLICT: `KEY_TAKEN`، `SYSTEM_PROTECTED`، `ROLE_IN_USE`، `MODULE_NOT_EMPTY`.

## [1.4.0] — ۱۴۰۵/۰۷/۱۴
### افزوده شد (سازگار)
- **مدیریت کاربر در پنل (high):** H-24 ساخت، H-25 ویرایش، H-26 فعال/غیرفعال، H-27 حذف نرم+ناشناس، H-28 رمز موقت/حذف رمز، H-29 خروج اجباری، H-50/H-51 نشست‌های کاربر. `SystemUser.status`؛ `H-21` ⇒ `SystemUserDetail`؛ فیلترهای تازهٔ `H-20` (grant/status/createdFrom/createdTo/sort).
- **حساب من (high):** H-02..H-07 (نام، رمز، نشست‌ها) — مطابق قفل #8 همهٔ اقدام‌های ادمین از `/s/v1`.
- **مدیریت جلسه (high ⇒ mid):** H-60..H-72 (فهرست/جزئیات/ساخت/ویرایش/وضعیت/حذف نرم/اعضا/حضور/صف/ارزیابی).
- **گزارش‌های تحلیلی:** H-80..H-84؛ فیلترهای تازهٔ audit (actorId/targetType/targetId/from/to).
- مجوزهای تازه: `system.users.manage`، `system.sessions.view`، `system.sessions.manage`، `system.reports.view`.
- low: `Me.mustChangePassword`، `SetPasswordBody.currentPassword`؛ خطاهای `AUTH_PASSWORD_CHANGE_REQUIRED`، `AUTH_ACCOUNT_DISABLED`؛ دلایل CONFLICT: `PHONE_TAKEN`، `SELF_PROTECTED`، `USER_NOT_ACTIVE`.
- قرارداد internal بین‌سرویسی (`internal.*` در بستهٔ api-types؛ خارج از OpenAPI): مسیرهای `LOW_ADMIN`/`MID_ADMIN` و رویدادهای `user.phone.changed`، `user.status.changed`.

## [1.3.2] — ۱۴۰۵/۰۷/۱۳
### اصلاح (سازگار)
- متن `SERVICE_UNAVAILABLE`: «در حال نگهداری» برای هر ۵۰۳ گمراه‌کننده بود (قطعی گذرای وابستگی هم ۵۰۳ است)؛ متن خنثی شد. حالت نگهداری واقعی پیام و `details.reason='maintenance'` جدا دارد.

## [1.3.1] — ۱۴۰۵/۰۷/۱۳
### اصلاح (سازگار)
- OpenAPI `servers`: آدرس تولید هر سرویس ساب‌دامنهٔ خودش است (`capi|oapi|sapi.israapp.ir`)، نه `api.israapp.ir`؛ توضیح TTL توکن‌ها از پیکربندی سرور.

## [1.3.0] — ۱۴۰۵/۰۷/۱۲
### افزوده شد (سازگار)
- `SessionLocation.routeUrl` (اختیاری، فقط https، حداکثر ۵۰۰): لینک مسیریابی که سازندهٔ جلسه کنار آدرس متنی می‌گذارد.

## [1.2.0] — ۱۴۰۵/۰۷/۱۲
### افزوده شد (سازگار)
- `SessionMe.evalWeights` (M-02): وزن‌های فعلی ارزیابی برای پیش‌نمایش امتیاز در فرم.

## [1.1.0] — ۱۴۰۵/۰۷/۱۱
### تغییر (سازگار)
- `StepUpResult.stepUpToken`: حداکثر طول ۵۱۲ → ۱۰۲۴ (توکن step-up اکنون JWT امضاشده است تا api-high بدون hop به low آن را محلی تأیید کند). کلاینت‌ها توکن را opaque می‌دانند ⇒ بدون اثر.

## [1.0.0] — ۱۴۰۵/۰۷/۰۹
### افزوده شد
- schemaهای zod و OpenAPI 3.1 برای `api-low` (`/c/v1`)، `api-mid` (`/o/v1`)، `api-high` (`/s/v1`).
- ثبت پایدار کدهای خطا، قالب پاسخ/خطا، هدرها، rate-limit، cache، idempotency و SLO per endpoint.
- Socket.IO (mid): رویدادهای `attendance.updated`، `queue.updated`، `queue.turned`، `eval.updated`، `session.state`.
- ابزار تشخیص تغییر ناسازگار (`diffOpenApi`) و تست‌های سیاست امنیت/پرفورمنس.
