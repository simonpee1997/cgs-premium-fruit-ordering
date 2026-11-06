# Promotion release status

The earlier publication approval is superseded by the owner’s explicit review-only request. **Do not execute production SQL or deploy.**

Use [the current SQL review](PROMOTION-SQL-REVIEW.md) and [the backup/deployment/rollback plan](PROMOTION-DEPLOYMENT-AND-ROLLBACK.md). The corrected fresh-install bundle is `supabase/review/promotion-release-reviewed.sql`; it keeps CGSVIP20 as a draft and is not approved for execution.

Actual production schema compatibility still requires a separately authorized schema-only export/review. No production migrations or deployment were performed in this review.
