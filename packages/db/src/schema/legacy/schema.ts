import { pgTable, index, foreignKey, pgPolicy, uuid, timestamp, jsonb, unique, check, varchar, text, bigint, serial, type AnyPgColumn, uniqueIndex, boolean, integer, numeric, pgSchema, date, vector, doublePrecision, primaryKey, pgView, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const basejump = pgSchema("basejump");
export const accountRoleInBasejump = basejump.enum("account_role", ['owner', 'member'])
export const invitationTypeInBasejump = basejump.enum("invitation_type", ['one_time', '24_hour'])
export const subscriptionStatusInBasejump = basejump.enum("subscription_status", ['trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid'])
export const agentTriggerType = pgEnum("agent_trigger_type", ['telegram', 'slack', 'webhook', 'schedule', 'email', 'github', 'discord', 'teams'])
export const agentWorkflowStatus = pgEnum("agent_workflow_status", ['draft', 'active', 'paused', 'archived'])
export const apiKeyStatus = pgEnum("api_key_status", ['active', 'revoked', 'expired'])
export const benchmarkResultStatus = pgEnum("benchmark_result_status", ['completed', 'failed', 'timeout', 'error'])
export const benchmarkRunStatus = pgEnum("benchmark_run_status", ['running', 'completed', 'failed', 'cancelled'])
export const benchmarkRunType = pgEnum("benchmark_run_type", ['core_test', 'stress_test'])
export const memoryExtractionStatus = pgEnum("memory_extraction_status", ['pending', 'processing', 'completed', 'failed'])
export const memoryType = pgEnum("memory_type", ['fact', 'preference', 'context', 'conversation_summary'])
export const taxonomyRunStatus = pgEnum("taxonomy_run_status", ['pending', 'embedding', 'clustering', 'labeling', 'completed', 'failed'])
export const threadStatus = pgEnum("thread_status", ['pending', 'initializing', 'ready', 'error'])
export const ticketCategory = pgEnum("ticket_category", ['billing', 'technical', 'account', 'feature_request', 'general'])
export const ticketMessageType = pgEnum("ticket_message_type", ['user', 'admin', 'internal_note'])
export const ticketPriority = pgEnum("ticket_priority", ['low', 'medium', 'high', 'urgent'])
export const ticketStatus = pgEnum("ticket_status", ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'])
export const userRole = pgEnum("user_role", ['user', 'admin', 'super_admin'])


export const userRoles = pgTable("user_roles", {
	userId: uuid("user_id").primaryKey().notNull(),
	role: userRole().default('user').notNull(),
	grantedBy: uuid("granted_by"),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_user_roles_granted_by").using("btree", table.grantedBy.asc().nullsLast().op("uuid_ops")),
	index("idx_user_roles_role").using("btree", table.role.asc().nullsLast().op("enum_ops")),
	index("idx_user_roles_user_role").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.role.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.grantedBy],
			foreignColumns: [users.id],
			name: "user_roles_granted_by_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_roles_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage all roles", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view their own role", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const fileUploads = pgTable("file_uploads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id"),
	threadId: uuid("thread_id"),
	agentId: uuid("agent_id"),
	accountId: uuid("account_id").notNull(),
	userId: uuid("user_id"),
	bucketName: varchar("bucket_name", { length: 255 }).notNull(),
	storagePath: text("storage_path").notNull(),
	originalFilename: text("original_filename").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	contentType: varchar("content_type", { length: 255 }),
	signedUrl: text("signed_url"),
	urlExpiresAt: timestamp("url_expires_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_file_uploads_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_file_uploads_account_id_created_at").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_file_uploads_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_file_uploads_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_file_uploads_expires").using("btree", table.urlExpiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(url_expires_at IS NOT NULL)`),
	index("idx_file_uploads_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_file_uploads_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "file_uploads_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "file_uploads_agent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "file_uploads_thread_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "file_uploads_user_id_fkey"
		}).onDelete("cascade"),
	unique("file_uploads_user_storage_unique").on(table.userId, table.bucketName, table.storagePath),
	pgPolicy("Users can create their own file uploads", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = file_uploads.account_id) AND (au.user_id = auth.uid()))))`  }),
	pgPolicy("Users can delete their own file uploads", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Users can update their own file uploads", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own file uploads", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("file_uploads_bucket_name_check", sql`(bucket_name)::text = ANY ((ARRAY['file-uploads'::character varying, 'browser-screenshots'::character varying])::text[])`),
	check("file_uploads_file_size_check", sql`file_size > 0`),
	check("file_uploads_original_filename_check", sql`length(TRIM(BOTH FROM original_filename)) > 0`),
]);

export const migrationLog = pgTable("migration_log", {
	id: serial().primaryKey().notNull(),
	migrationName: text("migration_name").notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	status: text().notNull(),
	metadata: jsonb().default({}),
	notes: text(),
}, (table) => [
	pgPolicy("Service role only access", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const adminActionsLog = pgTable("admin_actions_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	adminUserId: uuid("admin_user_id").notNull(),
	actionType: text("action_type").notNull(),
	targetUserId: uuid("target_user_id"),
	details: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_admin_actions_admin").using("btree", table.adminUserId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_admin_actions_target").using("btree", table.targetUserId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_admin_actions_type").using("btree", table.actionType.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.adminUserId],
			foreignColumns: [users.id],
			name: "admin_actions_log_admin_user_id_fkey"
		}),
	foreignKey({
			columns: [table.targetUserId],
			foreignColumns: [users.id],
			name: "admin_actions_log_target_user_id_fkey"
		}),
	pgPolicy("Only admins can view logs", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))` }),
	pgPolicy("Service role manages logs", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const agents = pgTable("agents", {
	agentId: uuid("agent_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isPublic: boolean("is_public").default(false),
	tags: text().array().default([""]),
	currentVersionId: uuid("current_version_id"),
	versionCount: integer("version_count").default(1),
	metadata: jsonb().default({}),
	iconName: varchar("icon_name", { length: 100 }).notNull(),
	iconColor: varchar("icon_color", { length: 7 }).default('#000000').notNull(),
	iconBackground: varchar("icon_background", { length: 7 }).default('#F3F4F6').notNull(),
	createdByUserId: uuid("created_by_user_id"),
	updatedByUserId: uuid("updated_by_user_id"),
}, (table) => [
	index("idx_agents_account_created_desc").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	uniqueIndex("idx_agents_account_default").using("btree", table.accountId.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("bool_ops")).where(sql`(is_default = true)`),
	index("idx_agents_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_agents_account_id_is_public").using("btree", table.accountId.asc().nullsLast().op("bool_ops"), table.isPublic.asc().nullsLast().op("uuid_ops")),
	index("idx_agents_account_non_default").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`(((metadata ->> 'is_suna_default'::text))::boolean IS NOT TRUE)`),
	index("idx_agents_account_non_suna").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`(((metadata ->> 'is_suna_default'::text))::boolean IS NOT TRUE)`),
	index("idx_agents_account_suna_default").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`((metadata ->> 'is_suna_default'::text) = 'true'::text)`),
	index("idx_agents_account_updated_desc").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_agents_centrally_managed").using("btree", sql`((metadata ->> 'centrally_managed'::text))`).where(sql`((metadata ->> 'centrally_managed'::text) = 'true'::text)`),
	index("idx_agents_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_agents_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")).where(sql`(created_by_user_id IS NOT NULL)`),
	index("idx_agents_current_version").using("btree", table.currentVersionId.asc().nullsLast().op("uuid_ops")),
	index("idx_agents_icon_name").using("btree", table.iconName.asc().nullsLast().op("text_ops")).where(sql`(icon_name IS NOT NULL)`),
	index("idx_agents_is_default").using("btree", table.isDefault.asc().nullsLast().op("bool_ops")),
	index("idx_agents_is_public").using("btree", table.isPublic.asc().nullsLast().op("bool_ops")),
	index("idx_agents_is_public_account_id").using("btree", table.isPublic.asc().nullsLast().op("bool_ops"), table.accountId.asc().nullsLast().op("bool_ops")),
	index("idx_agents_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_agents_suna_default").using("btree", sql`((metadata ->> 'is_suna_default'::text))`).where(sql`((metadata ->> 'is_suna_default'::text) = 'true'::text)`),
	uniqueIndex("idx_agents_suna_default_unique").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`((metadata ->> 'is_suna_default'::text) = 'true'::text)`),
	index("idx_agents_tags").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	index("idx_agents_updated_by").using("btree", table.updatedByUserId.asc().nullsLast().op("uuid_ops")).where(sql`(updated_by_user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "agents_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "agents_created_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.currentVersionId],
			foreignColumns: [agentVersions.versionId],
			name: "agents_current_version_id_fkey"
		}),
	foreignKey({
			columns: [table.updatedByUserId],
			foreignColumns: [users.id],
			name: "agents_updated_by_user_id_fkey"
		}),
	pgPolicy("agents_delete_own", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = agents.account_id) AND (au.user_id = auth.uid()) AND (au.account_role = 'owner'::basejump.account_role)))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))))` }),
	pgPolicy("agents_insert_own", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("agents_select_policy", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	pgPolicy("agents_update_own", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("agents_icon_background_format", sql`(icon_background IS NULL) OR ((icon_background)::text ~ '^#[0-9A-Fa-f]{6}$'::text)`),
	check("agents_icon_color_format", sql`(icon_color IS NULL) OR ((icon_color)::text ~ '^#[0-9A-Fa-f]{6}$'::text)`),
]);

export const creditLedger = pgTable("credit_ledger", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	amount: numeric({ precision: 12, scale:  4 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 12, scale:  4 }).notNull(),
	type: text().notNull(),
	description: text(),
	referenceId: uuid("reference_id"),
	referenceType: text("reference_type"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: uuid("created_by"),
	isExpiring: boolean("is_expiring").default(true),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	stripeEventId: varchar("stripe_event_id", { length: 255 }),
	messageId: uuid("message_id"),
	threadId: uuid("thread_id"),
	processingSource: text("processing_source"),
	idempotencyKey: text("idempotency_key"),
	lockedAt: timestamp("locked_at", { withTimezone: true, mode: 'string' }),
	triggeredByUserId: uuid("triggered_by_user_id"),
	teamMemberEmail: text("team_member_email"),
}, (table) => [
	index("idx_credit_ledger_account_created_debit").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")).where(sql`(amount < (0)::numeric)`),
	index("idx_credit_ledger_account_id").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_credit_ledger_account_type_created_desc").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.type.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_credit_ledger_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_credit_ledger_expiry").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.isExpiring.asc().nullsLast().op("uuid_ops"), table.expiresAt.asc().nullsLast().op("bool_ops")),
	index("idx_credit_ledger_idempotency").using("btree", table.idempotencyKey.asc().nullsLast().op("text_ops")).where(sql`(idempotency_key IS NOT NULL)`),
	index("idx_credit_ledger_recent_ops").using("btree", table.accountId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops"), table.amount.asc().nullsLast().op("uuid_ops"), table.description.asc().nullsLast().op("text_ops")),
	index("idx_credit_ledger_reference").using("btree", table.referenceId.asc().nullsLast().op("text_ops"), table.referenceType.asc().nullsLast().op("text_ops")),
	index("idx_credit_ledger_stripe_event").using("btree", table.stripeEventId.asc().nullsLast().op("text_ops")).where(sql`(stripe_event_id IS NOT NULL)`),
	index("idx_credit_ledger_triggered_by").using("btree", table.triggeredByUserId.asc().nullsLast().op("uuid_ops")).where(sql`(triggered_by_user_id IS NOT NULL)`),
	index("idx_credit_ledger_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "credit_ledger_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "credit_ledger_created_by_fkey"
		}),
	foreignKey({
			columns: [table.triggeredByUserId],
			foreignColumns: [users.id],
			name: "credit_ledger_triggered_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "credit_ledger_user_id_fkey"
		}).onDelete("cascade"),
	unique("unique_stripe_event").on(table.stripeEventId),
	pgPolicy("Service role manages ledger", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view own ledger", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("team_members_can_view_ledger", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("users can view credit ledger", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("credit_ledger_type_check", sql`type = ANY (ARRAY['tier_grant'::text, 'purchase'::text, 'admin_grant'::text, 'promotional'::text, 'usage'::text, 'refund'::text, 'adjustment'::text, 'expired'::text, 'tier_upgrade'::text, 'daily_grant'::text, 'daily_refresh'::text])`),
]);

export const agentVersions = pgTable("agent_versions", {
	versionId: uuid("version_id").defaultRandom().primaryKey().notNull(),
	agentId: uuid("agent_id").notNull(),
	versionNumber: integer("version_number").notNull(),
	versionName: varchar("version_name", { length: 50 }).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: uuid("created_by"),
	config: jsonb().default({}).notNull(),
	changeDescription: text("change_description"),
	previousVersionId: uuid("previous_version_id"),
	model: varchar({ length: 255 }),
}, (table) => [
	index("idx_agent_versions_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_versions_agent_version_desc").using("btree", table.agentId.asc().nullsLast().op("uuid_ops"), table.versionNumber.desc().nullsFirst().op("uuid_ops")),
	index("idx_agent_versions_config_system_prompt").using("gin", sql`((config ->> 'system_prompt'::text))`),
	index("idx_agent_versions_config_tools").using("gin", sql`((config -> 'tools'::text))`),
	index("idx_agent_versions_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_agent_versions_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_versions_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_agent_versions_model").using("btree", table.model.asc().nullsLast().op("text_ops")),
	index("idx_agent_versions_previous_version_id").using("btree", table.previousVersionId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_versions_version_number").using("btree", table.versionNumber.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "agent_versions_agent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [accountsInBasejump.id],
			name: "agent_versions_created_by_fkey"
		}),
	foreignKey({
			columns: [table.previousVersionId],
			foreignColumns: [table.versionId],
			name: "agent_versions_previous_version_id_fkey"
		}),
	unique("agent_versions_agent_id_version_number_key").on(table.agentId, table.versionNumber),
	unique("agent_versions_agent_id_version_name_key").on(table.agentId, table.versionName),
	pgPolicy("agent_versions_delete_policy", { as: "permissive", for: "delete", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM agents
  WHERE ((agents.agent_id = agent_versions.agent_id) AND basejump.has_role_on_account(agents.account_id, 'owner'::basejump.account_role))))` }),
	pgPolicy("agent_versions_insert_policy", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("agent_versions_select_policy", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("agent_versions_update_policy", { as: "permissive", for: "update", to: ["public"] }),
	check("agent_versions_config_structure_check", sql`(config ? 'system_prompt'::text) AND (config ? 'tools'::text)`),
]);

export const apiKeys = pgTable("api_keys", {
	keyId: uuid("key_id").defaultRandom().primaryKey().notNull(),
	publicKey: varchar("public_key", { length: 64 }).notNull(),
	secretKeyHash: varchar("secret_key_hash", { length: 64 }).notNull(),
	accountId: uuid("account_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	status: apiKeyStatus().default('active'),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_api_keys_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_api_keys_public_key").using("btree", table.publicKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "api_keys_account_id_fkey"
		}).onDelete("cascade"),
	unique("api_keys_public_key_key").on(table.publicKey),
	pgPolicy("Users can manage their own API keys", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid))))` }),
	check("api_keys_public_key_format", sql`(public_key)::text ~ '^pk_[a-zA-Z0-9]{32}$'::text`),
	check("api_keys_title_not_empty", sql`length(TRIM(BOTH FROM title)) > 0`),
]);

export const vapiCalls = pgTable("vapi_calls", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	callId: text("call_id").notNull(),
	agentId: uuid("agent_id"),
	threadId: uuid("thread_id"),
	phoneNumber: text("phone_number").notNull(),
	direction: text().notNull(),
	status: text().default('queued').notNull(),
	durationSeconds: integer("duration_seconds"),
	transcript: jsonb(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	cost: numeric({ precision: 10, scale:  6 }),
}, (table) => [
	index("idx_vapi_calls_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_vapi_calls_call_id").using("btree", table.callId.asc().nullsLast().op("text_ops")),
	index("idx_vapi_calls_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_vapi_calls_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_vapi_calls_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "vapi_calls_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "vapi_calls_thread_id_fkey"
		}).onDelete("cascade"),
	unique("vapi_calls_call_id_key").on(table.callId),
	pgPolicy("System can insert calls", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true`  }),
	pgPolicy("System can update calls", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own calls", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("vapi_calls_direction_check", sql`direction = ANY (ARRAY['inbound'::text, 'outbound'::text])`),
	check("vapi_calls_status_check", sql`status = ANY (ARRAY['queued'::text, 'ringing'::text, 'in-progress'::text, 'completed'::text, 'ended'::text, 'failed'::text])`),
]);

export const configInBasejump = basejump.table("config", {
	enableTeamAccounts: boolean("enable_team_accounts").default(true),
	enablePersonalAccountBilling: boolean("enable_personal_account_billing").default(true),
	enableTeamAccountBilling: boolean("enable_team_account_billing").default(true),
	billingProvider: text("billing_provider").default('stripe'),
}, (table) => [
	pgPolicy("Basejump settings can be read by authenticated users", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const billingSubscriptionsInBasejump = basejump.table("billing_subscriptions", {
	id: text().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	billingCustomerId: text("billing_customer_id").notNull(),
	status: subscriptionStatusInBasejump(),
	metadata: jsonb(),
	priceId: text("price_id"),
	planName: text("plan_name"),
	quantity: integer(),
	cancelAtPeriodEnd: boolean("cancel_at_period_end"),
	created: timestamp({ withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	cancelAt: timestamp("cancel_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	canceledAt: timestamp("canceled_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	trialStart: timestamp("trial_start", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	trialEnd: timestamp("trial_end", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	provider: text(),
}, (table) => [
	index("idx_billing_subscriptions_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_billing_subscriptions_billing_customer_id").using("btree", table.billingCustomerId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "billing_subscriptions_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.billingCustomerId],
			foreignColumns: [billingCustomersInBasejump.id],
			name: "billing_subscriptions_billing_customer_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Can only view own billing subscription data.", { as: "permissive", for: "select", to: ["public"], using: sql`(basejump.has_role_on_account(account_id) = true)` }),
]);

export const invitationsInBasejump = basejump.table("invitations", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountRole: accountRoleInBasejump("account_role").notNull(),
	accountId: uuid("account_id").notNull(),
	token: text().default(basejump.generate_token(30)).notNull(),
	invitedByUserId: uuid("invited_by_user_id").notNull(),
	accountName: text("account_name"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	invitationType: invitationTypeInBasejump("invitation_type").notNull(),
}, (table) => [
	index("idx_invitations_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_invitations_invited_by_user_id").using("btree", table.invitedByUserId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "invitations_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invitedByUserId],
			foreignColumns: [users.id],
			name: "invitations_invited_by_user_id_fkey"
		}),
	unique("invitations_token_key").on(table.token),
	pgPolicy("Invitations can be created by account owners", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`((basejump.is_set('enable_team_accounts'::text) = true) AND (( SELECT accounts.personal_account
   FROM basejump.accounts
  WHERE (accounts.id = invitations.account_id)) = false) AND (basejump.has_role_on_account(account_id, 'owner'::basejump.account_role) = true))`  }),
	pgPolicy("Invitations can be deleted by account owners", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Invitations viewable by account owners", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const auditLog = pgTable("audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	category: varchar({ length: 50 }).notNull(),
	action: varchar({ length: 255 }).notNull(),
	details: jsonb().default({}),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_audit_log_account").using("btree", table.accountId.asc().nullsLast().op("text_ops"), table.category.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_audit_log_category").using("btree", table.category.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_audit_log_recent").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "audit_log_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role manages audit log", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view own audit log", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const billingCustomersInBasejump = basejump.table("billing_customers", {
	accountId: uuid("account_id").notNull(),
	id: text().primaryKey().notNull(),
	email: text(),
	active: boolean(),
	provider: text(),
}, (table) => [
	index("idx_billing_customers_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "billing_customers_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Can only view own billing customer data.", { as: "permissive", for: "select", to: ["public"], using: sql`(basejump.has_role_on_account(account_id) = true)` }),
]);

export const agentRuns = pgTable("agent_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	status: text().default('running').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	agentId: uuid("agent_id"),
	agentVersionId: uuid("agent_version_id"),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_agent_runs_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_runs_agent_version_id").using("btree", table.agentVersionId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_runs_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_agent_runs_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_agent_runs_started_at").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_agent_runs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_agent_runs_status_created_desc").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_agent_runs_status_running").using("btree", table.status.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(status = 'running'::text)`),
	index("idx_agent_runs_status_started_at").using("btree", table.status.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(status IS NOT NULL)`),
	index("idx_agent_runs_status_thread").using("btree", table.status.asc().nullsLast().op("uuid_ops"), table.threadId.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'running'::text)`),
	index("idx_agent_runs_thread_agent_created_desc").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.agentId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_agent_runs_thread_created_desc").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_agent_runs_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_runs_thread_status").using("btree", table.threadId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_agent_runs_thread_status_started").using("btree", table.threadId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("uuid_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(status = 'running'::text)`),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "agent_runs_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.agentVersionId],
			foreignColumns: [agentVersions.versionId],
			name: "agent_runs_agent_version_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "agent_runs_thread_id_fkey"
		}),
	pgPolicy("agent_runs_delete_policy", { as: "permissive", for: "delete", to: ["anon", "authenticated"], using: sql`true` }),
	pgPolicy("agent_runs_insert_policy", { as: "permissive", for: "insert", to: ["anon", "authenticated"] }),
	pgPolicy("agent_runs_select_policy", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	pgPolicy("agent_runs_update_policy", { as: "permissive", for: "update", to: ["anon", "authenticated"] }),
]);

export const projects = pgTable("projects", {
	projectId: uuid("project_id").defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	accountId: uuid("account_id").notNull(),
	isPublic: boolean("is_public").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	iconName: text("icon_name"),
	category: text().default('Uncategorized'),
	categories: text().array().default([""]),
	lastCategorizedAt: timestamp("last_categorized_at", { withTimezone: true, mode: 'string' }),
	sandboxResourceId: uuid("sandbox_resource_id"),
}, (table) => [
	index("idx_projects_account_created").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_projects_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_projects_account_id_is_public").using("btree", table.accountId.asc().nullsLast().op("bool_ops"), table.isPublic.asc().nullsLast().op("uuid_ops")).where(sql`(is_public IS NOT NULL)`),
	index("idx_projects_categories_gin").using("gin", table.categories.asc().nullsLast().op("array_ops")),
	index("idx_projects_categorization_stale").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops"), table.lastCategorizedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((last_categorized_at IS NULL) OR (last_categorized_at < updated_at))`),
	index("idx_projects_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_projects_category_created_at").using("btree", table.category.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("idx_projects_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_projects_is_public_account_id").using("btree", table.isPublic.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`(is_public IS NOT NULL)`),
	index("idx_projects_last_categorized").using("btree", table.lastCategorizedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(last_categorized_at IS NOT NULL)`),
	index("idx_projects_last_categorized_at").using("btree", table.lastCategorizedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_projects_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_projects_project_id_account").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_projects_sandbox_resource").using("btree", table.sandboxResourceId.asc().nullsLast().op("uuid_ops")).where(sql`(sandbox_resource_id IS NOT NULL)`),
	index("idx_projects_sandbox_resource_id").using("btree", table.sandboxResourceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "projects_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sandboxResourceId],
			foreignColumns: [resources.id],
			name: "projects_sandbox_resource_id_fkey"
		}),
	pgPolicy("project_delete_policy", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = projects.account_id) AND (au.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))))` }),
	pgPolicy("project_insert_policy", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("project_select_policy", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	pgPolicy("project_update_policy", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const commitmentHistory = pgTable("commitment_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	commitmentType: varchar("commitment_type", { length: 50 }),
	priceId: varchar("price_id", { length: 255 }),
	startDate: timestamp("start_date", { withTimezone: true, mode: 'string' }).notNull(),
	endDate: timestamp("end_date", { withTimezone: true, mode: 'string' }).notNull(),
	stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	cancellationReason: text("cancellation_reason"),
}, (table) => [
	index("idx_commitment_history_account").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_commitment_history_active").using("btree", table.endDate.asc().nullsLast().op("timestamptz_ops")).where(sql`(cancelled_at IS NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "commitment_history_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage commitment history", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view own commitment history", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const messages = pgTable("messages", {
	messageId: uuid("message_id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	type: text().notNull(),
	isLlmMessage: boolean("is_llm_message").default(true).notNull(),
	content: jsonb().notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	agentId: uuid("agent_id"),
	agentVersionId: uuid("agent_version_id"),
	createdByUserId: uuid("created_by_user_id"),
	isOmitted: boolean("is_omitted").default(false),
	isArchived: boolean("is_archived").default(false),
	archiveId: uuid("archive_id"),
}, (table) => [
	index("idx_messages_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_agent_id_thread_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops"), table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(agent_id IS NOT NULL)`),
	index("idx_messages_agent_version_id").using("btree", table.agentVersionId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_agent_version_id_thread_id").using("btree", table.agentVersionId.asc().nullsLast().op("uuid_ops"), table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")).where(sql`(agent_version_id IS NOT NULL)`),
	index("idx_messages_archive_id").using("btree", table.archiveId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_messages_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")).where(sql`(created_by_user_id IS NOT NULL)`),
	index("idx_messages_is_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
	index("idx_messages_llm_not_omitted").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")).where(sql`((is_llm_message = true) AND (is_omitted = false))`),
	index("idx_messages_llm_thread_created").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")).where(sql`(is_llm_message = true)`),
	index("idx_messages_metadata_llm_response_id").using("btree", sql`((metadata ->> 'llm_response_id'::text))`),
	index("idx_messages_thread_created").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_messages_thread_created_at").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_messages_thread_created_desc").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_messages_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_thread_id_created_at").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_messages_thread_llm").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(is_llm_message = true)`),
	index("idx_messages_thread_llm_created").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")).where(sql`(is_llm_message = true)`),
	index("idx_messages_thread_llm_created_asc").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(is_llm_message = true)`),
	index("idx_messages_thread_optimized_types_created_desc").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")).where(sql`(type = ANY (ARRAY['user'::text, 'tool'::text, 'assistant'::text]))`),
	index("idx_messages_thread_type_created").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.type.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_messages_thread_type_created_at").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.type.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("text_ops")).where(sql`(type IS NOT NULL)`),
	index("idx_messages_thread_type_created_desc").using("btree", table.threadId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_messages_thread_type_llm_summary_created_desc").using("btree", table.threadId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("bool_ops"), table.isLlmMessage.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("bool_ops")).where(sql`(type = 'summary'::text)`),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "messages_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.agentVersionId],
			foreignColumns: [agentVersions.versionId],
			name: "messages_agent_version_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.archiveId],
			foreignColumns: [archivedContext.archiveId],
			name: "messages_archive_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "messages_created_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "messages_thread_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("message_delete_policy", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`((EXISTS ( SELECT 1
   FROM (threads t
     JOIN basejump.account_user au ON ((au.account_id = t.account_id)))
  WHERE ((t.thread_id = messages.thread_id) AND (au.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))))` }),
	pgPolicy("message_insert_policy", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("message_select_policy", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	pgPolicy("message_update_policy", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const userMcpCredentialProfiles = pgTable("user_mcp_credential_profiles", {
	profileId: uuid("profile_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	mcpQualifiedName: text("mcp_qualified_name").notNull(),
	profileName: text("profile_name").notNull(),
	displayName: text("display_name").notNull(),
	encryptedConfig: text("encrypted_config").notNull(),
	configHash: text("config_hash").notNull(),
	isActive: boolean("is_active").default(true),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_credential_profiles_account_active").using("btree", table.accountId.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("uuid_ops")).where(sql`(is_active = true)`),
	index("idx_credential_profiles_account_mcp").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.mcpQualifiedName.asc().nullsLast().op("text_ops")),
	index("idx_credential_profiles_default").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.mcpQualifiedName.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("uuid_ops")).where(sql`(is_default = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "fk_credential_profiles_account"
		}).onDelete("cascade"),
	unique("user_mcp_credential_profiles_account_id_mcp_qualified_name__key").on(table.accountId, table.mcpQualifiedName, table.profileName),
	pgPolicy("credential_profiles_user_access", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid))))`, withCheck: sql`(account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid))))`  }),
]);

export const creditBalance = pgTable("credit_balance", {
	accountId: uuid("account_id").primaryKey().notNull(),
	balanceDollars: numeric("balance_dollars", { precision: 10, scale:  2 }).default('0').notNull(),
	totalPurchased: numeric("total_purchased", { precision: 10, scale:  2 }).default('0').notNull(),
	totalUsed: numeric("total_used", { precision: 10, scale:  2 }).default('0').notNull(),
	lastUpdated: timestamp("last_updated", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_credit_balance_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "credit_balance_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage all credit balances", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view their own credit balance", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("credit_balance_balance_dollars_check", sql`balance_dollars >= (0)::numeric`),
	check("credit_balance_total_purchased_check", sql`total_purchased >= (0)::numeric`),
	check("credit_balance_total_used_check", sql`total_used >= (0)::numeric`),
]);

export const creditUsage = pgTable("credit_usage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	amountDollars: numeric("amount_dollars", { precision: 10, scale:  2 }).notNull(),
	threadId: uuid("thread_id"),
	messageId: uuid("message_id"),
	description: text(),
	usageType: text("usage_type").default('token_overage'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	subscriptionTier: text("subscription_tier"),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_credit_usage_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_credit_usage_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_credit_usage_message_id").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
	index("idx_credit_usage_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.messageId],
			foreignColumns: [messages.messageId],
			name: "credit_usage_message_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "credit_usage_thread_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "credit_usage_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage all credit usage", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view their own credit usage", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("credit_usage_amount_dollars_check", sql`amount_dollars > (0)::numeric`),
	check("credit_usage_usage_type_check", sql`usage_type = ANY (ARRAY['token_overage'::text, 'manual_deduction'::text, 'adjustment'::text])`),
]);

export const creditPurchases = pgTable("credit_purchases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	amountDollars: numeric("amount_dollars", { precision: 10, scale:  2 }).notNull(),
	stripePaymentIntentId: text("stripe_payment_intent_id"),
	stripeChargeId: text("stripe_charge_id"),
	status: text().default('pending').notNull(),
	description: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	reconciledAt: timestamp("reconciled_at", { withTimezone: true, mode: 'string' }),
	reconciliationAttempts: integer("reconciliation_attempts").default(0),
	lastReconciliationAttempt: timestamp("last_reconciliation_attempt", { withTimezone: true, mode: 'string' }),
	provider: varchar({ length: 50 }).default('stripe'),
	revenuecatTransactionId: varchar("revenuecat_transaction_id", { length: 255 }),
	revenuecatProductId: varchar("revenuecat_product_id", { length: 255 }),
}, (table) => [
	index("idx_credit_purchases_account").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_credit_purchases_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_credit_purchases_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_credit_purchases_provider").using("btree", table.provider.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_credit_purchases_reconciled").using("btree", table.status.asc().nullsLast().op("text_ops"), table.reconciledAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((status = 'pending'::text) AND (reconciled_at IS NULL))`),
	index("idx_credit_purchases_revenuecat_transaction").using("btree", table.revenuecatTransactionId.asc().nullsLast().op("text_ops")),
	index("idx_credit_purchases_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_credit_purchases_stripe_payment_intent").using("btree", table.stripePaymentIntentId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "credit_purchases_user_id_fkey"
		}).onDelete("cascade"),
	unique("credit_purchases_stripe_payment_intent_id_key").on(table.stripePaymentIntentId),
	unique("credit_purchases_revenuecat_transaction_id_key").on(table.revenuecatTransactionId),
	pgPolicy("Service role can manage all credit purchases", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("users can view credit purchases", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("credit_purchases_amount_dollars_check", sql`amount_dollars > (0)::numeric`),
	check("credit_purchases_amount_positive", sql`amount_dollars > (0)::numeric`),
	check("credit_purchases_provider_check", sql`(provider)::text = ANY ((ARRAY['stripe'::character varying, 'revenuecat'::character varying])::text[])`),
	check("credit_purchases_status_check", sql`status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text])`),
]);

export const agentTemplates = pgTable("agent_templates", {
	templateId: uuid("template_id").defaultRandom().primaryKey().notNull(),
	creatorId: uuid("creator_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	tags: text().array().default([""]),
	isPublic: boolean("is_public").default(false),
	marketplacePublishedAt: timestamp("marketplace_published_at", { withTimezone: true, mode: 'string' }),
	downloadCount: integer("download_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
	isKortixTeam: boolean("is_kortix_team").default(false),
	config: jsonb().default({}),
	iconName: varchar("icon_name", { length: 100 }).notNull(),
	iconColor: varchar("icon_color", { length: 7 }).default('#000000').notNull(),
	iconBackground: varchar("icon_background", { length: 7 }).default('#F3F4F6').notNull(),
	usageExamples: jsonb("usage_examples").default([]),
	categories: text().array().default([""]),
}, (table) => [
	index("idx_agent_templates_categories").using("gin", table.categories.asc().nullsLast().op("array_ops")),
	index("idx_agent_templates_config_agentpress").using("gin", sql`(((config -> 'tools'::text) -> 'agentpress'::text))`),
	index("idx_agent_templates_config_tools").using("gin", sql`((config -> 'tools'::text))`),
	index("idx_agent_templates_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_agent_templates_creator_created_desc").using("btree", table.creatorId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_agent_templates_creator_id").using("btree", table.creatorId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_templates_download_count").using("btree", table.downloadCount.asc().nullsLast().op("int4_ops")),
	index("idx_agent_templates_icon_name").using("btree", table.iconName.asc().nullsLast().op("text_ops")).where(sql`(icon_name IS NOT NULL)`),
	index("idx_agent_templates_is_kortix_team").using("btree", table.isKortixTeam.asc().nullsLast().op("bool_ops")),
	index("idx_agent_templates_is_public").using("btree", table.isPublic.asc().nullsLast().op("bool_ops")),
	index("idx_agent_templates_is_public_creator_id").using("btree", table.isPublic.asc().nullsLast().op("bool_ops"), table.creatorId.asc().nullsLast().op("uuid_ops")).where(sql`(is_public IS NOT NULL)`),
	index("idx_agent_templates_marketplace_published_at").using("btree", table.marketplacePublishedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_agent_templates_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_agent_templates_name_trgm").using("gin", table.name.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_agent_templates_public_download_published_desc").using("btree", table.isPublic.asc().nullsLast().op("timestamptz_ops"), table.downloadCount.desc().nullsFirst().op("timestamptz_ops"), table.marketplacePublishedAt.desc().nullsFirst().op("bool_ops")),
	index("idx_agent_templates_public_kortix_created_desc").using("btree", table.isPublic.asc().nullsLast().op("timestamptz_ops"), table.isKortixTeam.asc().nullsLast().op("bool_ops"), table.createdAt.desc().nullsFirst().op("bool_ops")),
	index("idx_agent_templates_tags").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	index("idx_agent_templates_usage_examples").using("gin", table.usageExamples.asc().nullsLast().op("jsonb_ops")),
	foreignKey({
			columns: [table.creatorId],
			foreignColumns: [accountsInBasejump.id],
			name: "agent_templates_creator_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can create their own templates", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = agent_templates.creator_id) AND (au.user_id = auth.uid()))))`  }),
	pgPolicy("Users can delete their own templates", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Users can update their own templates", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view public templates or their own templates", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	check("agent_templates_config_structure_check", sql`(config ? 'system_prompt'::text) AND (config ? 'tools'::text) AND (config ? 'metadata'::text)`),
	check("agent_templates_icon_background_format", sql`(icon_background IS NULL) OR ((icon_background)::text ~ '^#[0-9A-Fa-f]{6}$'::text)`),
	check("agent_templates_icon_color_format", sql`(icon_color IS NULL) OR ((icon_color)::text ~ '^#[0-9A-Fa-f]{6}$'::text)`),
	check("agent_templates_tools_structure_check", sql`((config -> 'tools'::text) ? 'agentpress'::text) AND ((config -> 'tools'::text) ? 'mcp'::text) AND ((config -> 'tools'::text) ? 'custom_mcp'::text)`),
]);

export const arrMonthlyActuals = pgTable("arr_monthly_actuals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	monthIndex: integer("month_index").notNull(),
	monthName: text("month_name").notNull(),
	views: integer().default(0),
	signups: integer().default(0),
	newPaid: integer("new_paid").default(0),
	churn: integer().default(0),
	subscribers: integer().default(0),
	mrr: numeric({ precision: 12, scale:  2 }).default('0'),
	arr: numeric({ precision: 12, scale:  2 }).default('0'),
	overrides: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	platform: text().default('web').notNull(),
}, (table) => [
	index("idx_arr_monthly_actuals_month_platform").using("btree", table.monthIndex.asc().nullsLast().op("int4_ops"), table.platform.asc().nullsLast().op("int4_ops")),
	unique("arr_monthly_actuals_month_platform_key").on(table.monthIndex, table.platform),
	pgPolicy("Allow authenticated delete", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`true` }),
	pgPolicy("Allow authenticated insert", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Allow authenticated read", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Allow authenticated update", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("arr_monthly_actuals_platform_check", sql`platform = ANY (ARRAY['web'::text, 'app'::text])`),
]);

export const googleOauthTokens = pgTable("google_oauth_tokens", {
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id"),
	encryptedToken: text("encrypted_token"),
	tokenHash: text("token_hash"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	id: uuid().defaultRandom().primaryKey().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "google_oauth_tokens_user_id_fkey"
		}),
	unique("google_oauth_tokens_user_id_key").on(table.userId),
	pgPolicy("service_role_only", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const feedback = pgTable("feedback", {
	feedbackId: uuid("feedback_id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id"),
	messageId: uuid("message_id"),
	accountId: uuid("account_id").notNull(),
	rating: numeric({ precision: 2, scale:  1 }).notNull(),
	feedbackText: text("feedback_text"),
	helpImprove: boolean("help_improve").default(true),
	context: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("idx_feedback_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_feedback_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_feedback_message_id").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
	index("idx_feedback_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_feedback_unique").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.messageId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`((thread_id IS NOT NULL) AND (message_id IS NOT NULL))`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "feedback_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.messageId],
			foreignColumns: [messages.messageId],
			name: "feedback_message_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "feedback_thread_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can delete their own feedback", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = feedback.account_id) AND (au.user_id = auth.uid()))))` }),
	pgPolicy("Users can insert their own feedback", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Users can update their own feedback", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own feedback", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("feedback_rating_check", sql`(rating >= 0.5) AND (rating <= 5.0) AND ((rating % 0.5) = (0)::numeric)`),
]);

export const agentTriggers = pgTable("agent_triggers", {
	triggerId: uuid("trigger_id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	agentId: uuid("agent_id").notNull(),
	triggerType: agentTriggerType("trigger_type").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	isActive: boolean("is_active").default(true),
	config: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	executionType: varchar("execution_type", { length: 50 }).default('agent'),
	workflowId: uuid("workflow_id"),
}, (table) => [
	index("idx_agent_triggers_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_triggers_agent_type").using("btree", table.agentId.asc().nullsLast().op("uuid_ops"), table.triggerType.asc().nullsLast().op("enum_ops")),
	index("idx_agent_triggers_composio_active").using("btree", sql`((config ->> 'composio_trigger_id'::text))`, sql`is_active`).where(sql`(trigger_type = 'webhook'::agent_trigger_type)`),
	index("idx_agent_triggers_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_agent_triggers_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_agent_triggers_trigger_type").using("btree", table.triggerType.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "agent_triggers_agent_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("agent_triggers_delete_policy", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM (agents a
     JOIN basejump.account_user au ON ((au.account_id = a.account_id)))
  WHERE ((a.agent_id = agent_triggers.agent_id) AND (au.user_id = auth.uid()) AND (au.account_role = 'owner'::basejump.account_role))))` }),
	pgPolicy("agent_triggers_insert_policy", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("agent_triggers_select_policy", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	pgPolicy("agent_triggers_update_policy", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("agent_triggers_execution_type_check", sql`(execution_type)::text = ANY ((ARRAY['agent'::character varying, 'workflow'::character varying])::text[])`),
]);

export const circuitBreakerState = pgTable("circuit_breaker_state", {
	circuitName: text("circuit_name").primaryKey().notNull(),
	state: text().notNull(),
	failureCount: integer("failure_count").default(0).notNull(),
	lastFailureTime: timestamp("last_failure_time", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_circuit_breaker_state_state").using("btree", table.state.asc().nullsLast().op("text_ops")).where(sql`(state <> 'closed'::text)`),
	index("idx_circuit_breaker_state_updated_at").using("btree", table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	pgPolicy("Authenticated users can read circuit breaker state", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	pgPolicy("Service role has full access to circuit breaker", { as: "permissive", for: "all", to: ["service_role"] }),
	check("circuit_breaker_state_state_check", sql`state = ANY (ARRAY['closed'::text, 'open'::text, 'half_open'::text])`),
]);

export const trialHistory = pgTable("trial_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	convertedToPaid: boolean("converted_to_paid").default(false),
	stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	status: text().default('active'),
	errorMessage: text("error_message"),
}, (table) => [
	index("idx_trial_history_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_trial_history_started_at").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_trial_history_status").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`(status = ANY (ARRAY['checkout_pending'::text, 'checkout_failed'::text]))`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "trial_history_account_id_fkey"
		}).onDelete("cascade"),
	unique("unique_account_trial").on(table.accountId),
	pgPolicy("users can view trial history", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid))))` }),
	check("trial_history_status_check", sql`status = ANY (ARRAY['checkout_pending'::text, 'checkout_created'::text, 'checkout_failed'::text, 'active'::text, 'expired'::text, 'converted'::text, 'cancelled'::text])`),
]);

export const webhookConfig = pgTable("webhook_config", {
	id: integer().default(1).primaryKey().notNull(),
	backendUrl: text("backend_url").notNull(),
	webhookSecret: text("webhook_secret").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy("No public access", { as: "permissive", for: "all", to: ["anon", "authenticated"], using: sql`false` }),
	pgPolicy("Service role can manage webhook config", { as: "permissive", for: "all", to: ["service_role"] }),
	check("single_row", sql`id = 1`),
]);

export const agentWorkflowsBackup = pgTable("agent_workflows_backup", {
	id: uuid().primaryKey().notNull(),
	agentId: uuid("agent_id"),
	name: varchar({ length: 255 }),
	description: text(),
	status: agentWorkflowStatus(),
	triggerPhrase: varchar("trigger_phrase", { length: 255 }),
	isDefault: boolean("is_default"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	steps: jsonb(),
}, (table) => [
	pgPolicy("Service role only access", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const distributedLocks = pgTable("distributed_locks", {
	lockKey: text("lock_key").primaryKey().notNull(),
	holderId: text("holder_id").notNull(),
	acquiredAt: timestamp("acquired_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_distributed_locks_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	pgPolicy("Service role full access on distributed_locks", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.role() = 'service_role'::text)` }),
]);

export const webhookEvents = pgTable("webhook_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventId: text("event_id").notNull(),
	eventType: text("event_type").notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	processingStartedAt: timestamp("processing_started_at", { withTimezone: true, mode: 'string' }),
	status: text().default('pending').notNull(),
	payload: jsonb(),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_webhook_events_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_webhook_events_event_id").using("btree", table.eventId.asc().nullsLast().op("text_ops")),
	index("idx_webhook_events_status").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`(status = ANY (ARRAY['pending'::text, 'failed'::text]))`),
	unique("webhook_events_event_id_key").on(table.eventId),
	pgPolicy("Service role full access on webhook_events", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`, withCheck: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`  }),
	check("webhook_events_status_check", sql`status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])`),
]);

export const refundHistory = pgTable("refund_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	stripeRefundId: text("stripe_refund_id").notNull(),
	stripeChargeId: text("stripe_charge_id").notNull(),
	stripePaymentIntentId: text("stripe_payment_intent_id"),
	amountRefunded: numeric("amount_refunded", { precision: 10, scale:  2 }).notNull(),
	creditsDeducted: numeric("credits_deducted", { precision: 10, scale:  2 }).default('0').notNull(),
	refundReason: text("refund_reason"),
	status: text().default('pending').notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	errorMessage: text("error_message"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_refund_history_account").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_refund_history_status").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`(status = ANY (ARRAY['pending'::text, 'failed'::text]))`),
	index("idx_refund_history_stripe_refund").using("btree", table.stripeRefundId.asc().nullsLast().op("text_ops")),
	unique("refund_history_stripe_refund_id_key").on(table.stripeRefundId),
	pgPolicy("Service role full access on refund_history", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`, withCheck: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`  }),
	pgPolicy("Users can view own refund history", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("refund_history_status_check", sql`status = ANY (ARRAY['pending'::text, 'processed'::text, 'failed'::text])`),
]);

export const knowledgeBaseFolders = pgTable("knowledge_base_folders", {
	folderId: uuid("folder_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_kb_folders_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "knowledge_base_folders_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("kb_folders_account_access", { as: "permissive", for: "all", to: ["public"], using: sql`(basejump.has_role_on_account(account_id) = true)` }),
	check("kb_folders_name_not_empty", sql`length(TRIM(BOTH FROM name)) > 0`),
]);

export const knowledgeBaseEntries = pgTable("knowledge_base_entries", {
	entryId: uuid("entry_id").defaultRandom().primaryKey().notNull(),
	folderId: uuid("folder_id").notNull(),
	accountId: uuid("account_id").notNull(),
	filename: varchar({ length: 255 }).notNull(),
	filePath: text("file_path").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	mimeType: varchar("mime_type", { length: 255 }),
	summary: text().notNull(),
	usageContext: varchar("usage_context", { length: 100 }).default('always'),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_kb_entries_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_kb_entries_folder_id").using("btree", table.folderId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "knowledge_base_entries_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [knowledgeBaseFolders.folderId],
			name: "knowledge_base_entries_folder_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("kb_entries_account_access", { as: "permissive", for: "all", to: ["public"], using: sql`(basejump.has_role_on_account(account_id) = true)` }),
	check("kb_entries_file_size_positive", sql`file_size > 0`),
	check("kb_entries_filename_not_empty", sql`length(TRIM(BOTH FROM filename)) > 0`),
	check("kb_entries_summary_not_empty", sql`length(TRIM(BOTH FROM summary)) > 0`),
	check("knowledge_base_entries_usage_context_check", sql`(usage_context)::text = ANY ((ARRAY['always'::character varying, 'on_request'::character varying, 'contextual'::character varying])::text[])`),
]);

export const agentKnowledgeEntryAssignments = pgTable("agent_knowledge_entry_assignments", {
	assignmentId: uuid("assignment_id").defaultRandom().primaryKey().notNull(),
	agentId: uuid("agent_id").notNull(),
	entryId: uuid("entry_id").notNull(),
	accountId: uuid("account_id").notNull(),
	enabled: boolean().default(true),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_agent_knowledge_entry_assignments_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_kb_entry_assignments_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_kb_entry_assignments_entry_id").using("btree", table.entryId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "agent_knowledge_entry_assignments_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.agentId],
			name: "agent_knowledge_entry_assignments_agent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.entryId],
			foreignColumns: [knowledgeBaseEntries.entryId],
			name: "agent_knowledge_entry_assignments_entry_id_fkey"
		}).onDelete("cascade"),
	unique("agent_knowledge_entry_assignments_agent_id_entry_id_key").on(table.agentId, table.entryId),
	pgPolicy("kb_entry_assignments_account_access", { as: "permissive", for: "all", to: ["public"], using: sql`(basejump.has_role_on_account(account_id) = true)` }),
]);

export const dailyRefreshTracking = pgTable("daily_refresh_tracking", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	refreshDate: date("refresh_date").notNull(),
	creditsGranted: numeric("credits_granted", { precision: 10, scale:  2 }).notNull(),
	tier: text().notNull(),
	processedBy: text("processed_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_daily_refresh_tracking_account_date").using("btree", table.accountId.asc().nullsLast().op("date_ops"), table.refreshDate.desc().nullsFirst().op("date_ops")),
	index("idx_daily_refresh_tracking_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [creditAccounts.accountId],
			name: "daily_refresh_tracking_account_id_fkey"
		}).onDelete("cascade"),
	unique("daily_refresh_tracking_account_id_refresh_date_key").on(table.accountId, table.refreshDate),
	pgPolicy("Service role only access", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	userId: uuid("user_id").notNull(),
	title: text().notNull(),
	message: text().notNull(),
	type: varchar({ length: 50 }).default('info').notNull(),
	category: varchar({ length: 50 }).default(sql`NULL`),
	threadId: uuid("thread_id"),
	agentRunId: uuid("agent_run_id"),
	relatedEntityType: varchar("related_entity_type", { length: 50 }).default(sql`NULL`),
	relatedEntityId: uuid("related_entity_id"),
	isGlobal: boolean("is_global").default(false),
	createdBy: uuid("created_by"),
	metadata: jsonb().default({}),
	emailSent: boolean("email_sent").default(false),
	emailSentAt: timestamp("email_sent_at", { withTimezone: true, mode: 'string' }),
	emailError: text("email_error"),
	pushSent: boolean("push_sent").default(false),
	pushSentAt: timestamp("push_sent_at", { withTimezone: true, mode: 'string' }),
	pushError: text("push_error"),
	retryCount: integer("retry_count").default(0),
	lastRetryAt: timestamp("last_retry_at", { withTimezone: true, mode: 'string' }),
	isRead: boolean("is_read").default(false),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notifications_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_notifications_agent_run_id").using("btree", table.agentRunId.asc().nullsLast().op("uuid_ops")),
	index("idx_notifications_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_notifications_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_notifications_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")).where(sql`(created_by IS NOT NULL)`),
	index("idx_notifications_is_global").using("btree", table.isGlobal.asc().nullsLast().op("bool_ops")).where(sql`(is_global = true)`),
	index("idx_notifications_is_read").using("btree", table.isRead.asc().nullsLast().op("bool_ops")),
	index("idx_notifications_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_notifications_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("idx_notifications_user_created").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_notifications_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_notifications_user_unread").using("btree", table.userId.asc().nullsLast().op("bool_ops"), table.isRead.asc().nullsLast().op("uuid_ops")).where(sql`(is_read = false)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "notifications_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentRunId],
			foreignColumns: [agentRuns.id],
			name: "notifications_agent_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "notifications_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "notifications_thread_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage all notifications", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`, withCheck: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`  }),
	pgPolicy("Users can update their own notifications", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own notifications", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const userNotificationPreferences = pgTable("user_notification_preferences", {
	userId: uuid("user_id").primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	emailEnabled: boolean("email_enabled").default(true),
	pushEnabled: boolean("push_enabled").default(true),
	emailCategories: jsonb("email_categories").default({"admin":true,"agent":true,"system":true,"billing":true}),
	pushCategories: jsonb("push_categories").default({"admin":true,"agent":true,"system":true,"billing":true}),
	pushToken: text("push_token"),
	pushTokenUpdatedAt: timestamp("push_token_updated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_notification_preferences_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_notification_preferences_push_token").using("btree", table.pushToken.asc().nullsLast().op("text_ops")).where(sql`(push_token IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "user_notification_preferences_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_notification_preferences_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage all notification preferences", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`, withCheck: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`  }),
	pgPolicy("Users can manage their own notification preferences", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const clusteringRuns = pgTable("clustering_runs", {
	runId: uuid("run_id").defaultRandom().primaryKey().notNull(),
	status: text().default('running'),
	numClusters: integer("num_clusters"),
	numThreads: integer("num_threads"),
	dateRangeStart: timestamp("date_range_start", { withTimezone: true, mode: 'string' }),
	dateRangeEnd: timestamp("date_range_end", { withTimezone: true, mode: 'string' }),
	algorithm: text().default('kmeans'),
	parameters: jsonb().default({}),
	error: text(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_clustering_runs_created").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_clustering_runs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	pgPolicy("Admin read access for clustering_runs", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))` }),
	pgPolicy("Service role bypass for clustering_runs", { as: "permissive", for: "all", to: ["public"] }),
]);

export const threadEmbeddings = pgTable("thread_embeddings", {
	threadId: uuid("thread_id").primaryKey().notNull(),
	embedding: vector({ dimensions: 1536 }),
	textHash: text("text_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_thread_embeddings_updated").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "thread_embeddings_thread_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role bypass for thread_embeddings", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.role() = 'service_role'::text)` }),
]);

export const threadClusters = pgTable("thread_clusters", {
	clusterId: uuid("cluster_id").defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	clusterIndex: integer("cluster_index").notNull(),
	label: text(),
	description: text(),
	threadCount: integer("thread_count").default(0),
	sampleThreadIds: uuid("sample_thread_ids").array().default([""]),
	centroid: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_thread_clusters_run_id").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	unique("thread_clusters_run_id_cluster_index_key").on(table.runId, table.clusterIndex),
	pgPolicy("Admin read access for thread_clusters", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))` }),
	pgPolicy("Service role bypass for thread_clusters", { as: "permissive", for: "all", to: ["public"] }),
]);

export const taxonomyRuns = pgTable("taxonomy_runs", {
	runId: uuid("run_id").defaultRandom().primaryKey().notNull(),
	status: taxonomyRunStatus().default('pending').notNull(),
	config: jsonb().default({}).notNull(),
	projectCount: integer("project_count"),
	embeddedCount: integer("embedded_count"),
	clusterCount: integer("cluster_count"),
	errorMessage: text("error_message"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_taxonomy_runs_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_taxonomy_runs_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	pgPolicy("Service role has full access to taxonomy_runs", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const renewalProcessing = pgTable("renewal_processing", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	periodStart: bigint("period_start", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	periodEnd: bigint("period_end", { mode: "number" }).notNull(),
	subscriptionId: text("subscription_id").notNull(),
	processedBy: text("processed_by").notNull(),
	creditsGranted: numeric("credits_granted", { precision: 10, scale:  2 }).notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	stripeEventId: text("stripe_event_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	provider: text().default('stripe'),
	revenuecatTransactionId: text("revenuecat_transaction_id"),
	revenuecatProductId: text("revenuecat_product_id"),
}, (table) => [
	index("idx_renewal_processing_account").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_renewal_processing_period").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.periodStart.asc().nullsLast().op("uuid_ops")),
	index("idx_renewal_processing_provider").using("btree", table.provider.asc().nullsLast().op("text_ops")),
	index("idx_renewal_processing_subscription").using("btree", table.subscriptionId.asc().nullsLast().op("text_ops")),
	unique("renewal_processing_account_id_period_start_key").on(table.accountId, table.periodStart),
	pgPolicy("Service role full access on renewal_processing", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`, withCheck: sql`(( SELECT auth.role() AS role) = 'service_role'::text)`  }),
	check("renewal_processing_processed_by_check", sql`processed_by = ANY (ARRAY['webhook_invoice'::text, 'webhook_subscription'::text, 'manual'::text, 'cron'::text, 'revenuecat_webhook'::text])`),
	check("renewal_processing_provider_check", sql`provider = ANY (ARRAY['stripe'::text, 'revenuecat'::text])`),
]);

export const conversationAnalytics = pgTable("conversation_analytics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	agentRunId: uuid("agent_run_id"),
	accountId: uuid("account_id").notNull(),
	sentimentScore: numeric("sentiment_score", { precision: 3, scale:  2 }),
	sentimentLabel: text("sentiment_label"),
	frustrationScore: numeric("frustration_score", { precision: 3, scale:  2 }),
	frustrationSignals: jsonb("frustration_signals").default([]),
	churnRiskScore: numeric("churn_risk_score", { precision: 3, scale:  2 }),
	churnSignals: jsonb("churn_signals").default([]),
	primaryTopic: text("primary_topic"),
	topics: jsonb().default([]),
	intentType: text("intent_type"),
	isFeatureRequest: boolean("is_feature_request").default(false),
	featureRequestText: text("feature_request_text"),
	isUseful: boolean("is_useful").default(true),
	useCaseCategory: text("use_case_category"),
	useCaseSummary: text("use_case_summary"),
	outputType: text("output_type"),
	domain: text(),
	keywords: jsonb().default([]),
	userMessageCount: integer("user_message_count"),
	assistantMessageCount: integer("assistant_message_count"),
	conversationDurationSeconds: integer("conversation_duration_seconds"),
	agentRunStatus: text("agent_run_status"),
	analyzedAt: timestamp("analyzed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	rawAnalysis: jsonb("raw_analysis").default({}),
	useCaseEmbedding: vector("use_case_embedding", { dimensions: 1536 }),
}, (table) => [
	index("idx_conv_analytics_account").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_conv_analytics_analyzed_at").using("btree", table.analyzedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_conv_analytics_churn").using("btree", table.churnRiskScore.desc().nullsFirst().op("numeric_ops")),
	index("idx_conv_analytics_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("idx_conv_analytics_embedding").using("ivfflat", table.useCaseEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	index("idx_conv_analytics_feature_req").using("btree", table.isFeatureRequest.asc().nullsLast().op("bool_ops")).where(sql`is_feature_request`),
	index("idx_conv_analytics_frustration").using("btree", table.frustrationScore.desc().nullsFirst().op("numeric_ops")),
	index("idx_conv_analytics_intent").using("btree", table.intentType.asc().nullsLast().op("text_ops")),
	index("idx_conv_analytics_is_useful").using("btree", table.isUseful.asc().nullsLast().op("bool_ops")),
	index("idx_conv_analytics_output_type").using("btree", table.outputType.asc().nullsLast().op("text_ops")),
	index("idx_conv_analytics_primary_topic").using("btree", table.primaryTopic.asc().nullsLast().op("text_ops")),
	index("idx_conv_analytics_sentiment").using("btree", table.sentimentLabel.asc().nullsLast().op("text_ops")),
	index("idx_conv_analytics_thread").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_conv_analytics_use_case").using("gin", sql`to_tsvector('english'::regconfig, use_case_summary)`),
	foreignKey({
			columns: [table.agentRunId],
			foreignColumns: [agentRuns.id],
			name: "conversation_analytics_agent_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "conversation_analytics_thread_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("super_admin_select_analytics", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'super_admin'::user_role))))` }),
	check("conversation_analytics_intent_type_check", sql`intent_type = ANY (ARRAY['question'::text, 'task'::text, 'complaint'::text, 'feature_request'::text, 'chat'::text])`),
	check("conversation_analytics_sentiment_label_check", sql`sentiment_label = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, 'mixed'::text])`),
]);

export const conversationAnalyticsQueue = pgTable("conversation_analytics_queue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	agentRunId: uuid("agent_run_id"),
	accountId: uuid("account_id").notNull(),
	status: text().default('pending'),
	attempts: integer().default(0),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_analytics_queue_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("idx_analytics_queue_thread").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "conversation_analytics_queue_thread_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("super_admin_select_queue", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'super_admin'::user_role))))` }),
	check("conversation_analytics_queue_status_check", sql`status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])`),
]);

export const pricingViews = pgTable("pricing_views", {
	userId: uuid("user_id").primaryKey().notNull(),
	firstViewedAt: timestamp("first_viewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	viewCount: integer("view_count").default(1).notNull(),
	lastViewedAt: timestamp("last_viewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "pricing_views_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can track their own pricing views", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
]);

export const creditAccounts = pgTable("credit_accounts", {
	accountId: uuid("account_id").primaryKey().notNull(),
	balance: numeric({ precision: 12, scale:  4 }).default('0').notNull(),
	lifetimeGranted: numeric("lifetime_granted", { precision: 12, scale:  4 }).default('0').notNull(),
	lifetimePurchased: numeric("lifetime_purchased", { precision: 12, scale:  4 }).default('0').notNull(),
	lifetimeUsed: numeric("lifetime_used", { precision: 12, scale:  4 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastGrantDate: timestamp("last_grant_date", { withTimezone: true, mode: 'string' }),
	tier: varchar({ length: 50 }).default('free'),
	billingCycleAnchor: timestamp("billing_cycle_anchor", { withTimezone: true, mode: 'string' }),
	nextCreditGrant: timestamp("next_credit_grant", { withTimezone: true, mode: 'string' }),
	stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
	expiringCredits: numeric("expiring_credits", { precision: 12, scale:  4 }).default('0').notNull(),
	nonExpiringCredits: numeric("non_expiring_credits", { precision: 12, scale:  4 }).default('0').notNull(),
	trialStatus: varchar("trial_status", { length: 20 }).default('none'),
	trialStartedAt: timestamp("trial_started_at", { withTimezone: true, mode: 'string' }),
	trialEndsAt: timestamp("trial_ends_at", { withTimezone: true, mode: 'string' }),
	isGrandfatheredFree: boolean("is_grandfathered_free").default(false),
	lastProcessedInvoiceId: varchar("last_processed_invoice_id", { length: 255 }),
	commitmentType: varchar("commitment_type", { length: 50 }),
	commitmentStartDate: timestamp("commitment_start_date", { withTimezone: true, mode: 'string' }),
	commitmentEndDate: timestamp("commitment_end_date", { withTimezone: true, mode: 'string' }),
	commitmentPriceId: varchar("commitment_price_id", { length: 255 }),
	canCancelAfter: timestamp("can_cancel_after", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastRenewalPeriodStart: bigint("last_renewal_period_start", { mode: "number" }),
	lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true, mode: 'string' }),
	reconciliationDiscrepancy: numeric("reconciliation_discrepancy", { precision: 10, scale:  2 }).default('0'),
	needsReconciliation: boolean("needs_reconciliation").default(false),
	paymentStatus: text("payment_status").default('active'),
	lastPaymentFailure: timestamp("last_payment_failure", { withTimezone: true, mode: 'string' }),
	scheduledTierChange: text("scheduled_tier_change"),
	scheduledTierChangeDate: timestamp("scheduled_tier_change_date", { withTimezone: true, mode: 'string' }),
	scheduledPriceId: text("scheduled_price_id"),
	provider: varchar({ length: 20 }).default('stripe'),
	revenuecatCustomerId: varchar("revenuecat_customer_id", { length: 255 }),
	revenuecatSubscriptionId: varchar("revenuecat_subscription_id", { length: 255 }),
	revenuecatCancelledAt: timestamp("revenuecat_cancelled_at", { withTimezone: true, mode: 'string' }),
	revenuecatCancelAtPeriodEnd: timestamp("revenuecat_cancel_at_period_end", { withTimezone: true, mode: 'string' }),
	revenuecatPendingChangeProduct: text("revenuecat_pending_change_product"),
	revenuecatPendingChangeDate: timestamp("revenuecat_pending_change_date", { withTimezone: true, mode: 'string' }),
	revenuecatPendingChangeType: text("revenuecat_pending_change_type"),
	revenuecatProductId: text("revenuecat_product_id"),
	planType: varchar("plan_type", { length: 50 }).default('monthly'),
	stripeSubscriptionStatus: varchar("stripe_subscription_status", { length: 50 }),
	lastDailyRefresh: timestamp("last_daily_refresh", { withTimezone: true, mode: 'string' }),
	dailyCreditsBalance: numeric("daily_credits_balance", { precision: 10, scale:  2 }).default('0').notNull(),
}, (table) => [
	index("idx_credit_accounts_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_credit_accounts_commitment").using("btree", table.commitmentEndDate.asc().nullsLast().op("timestamptz_ops")).where(sql`(commitment_type IS NOT NULL)`),
	index("idx_credit_accounts_commitment_active").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.commitmentEndDate.asc().nullsLast().op("uuid_ops")).where(sql`(commitment_type IS NOT NULL)`),
	index("idx_credit_accounts_daily_balance").using("btree", table.accountId.asc().nullsLast().op("numeric_ops"), table.dailyCreditsBalance.asc().nullsLast().op("numeric_ops")).where(sql`(daily_credits_balance > (0)::numeric)`),
	index("idx_credit_accounts_expiry").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.nextCreditGrant.asc().nullsLast().op("timestamptz_ops")).where(sql`(expiring_credits > (0)::numeric)`),
	index("idx_credit_accounts_last_daily_refresh").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.lastDailyRefresh.asc().nullsLast().op("uuid_ops")).where(sql`(last_daily_refresh IS NOT NULL)`),
	index("idx_credit_accounts_last_grant").using("btree", table.lastGrantDate.asc().nullsLast().op("timestamptz_ops")),
	index("idx_credit_accounts_last_renewal_period").using("btree", table.accountId.asc().nullsLast().op("int8_ops"), table.lastRenewalPeriodStart.asc().nullsLast().op("int8_ops")),
	index("idx_credit_accounts_last_renewal_period_start").using("btree", table.lastRenewalPeriodStart.asc().nullsLast().op("int8_ops")).where(sql`(last_renewal_period_start IS NOT NULL)`),
	index("idx_credit_accounts_needs_reconciliation").using("btree", table.needsReconciliation.asc().nullsLast().op("bool_ops")).where(sql`(needs_reconciliation = true)`),
	index("idx_credit_accounts_next_grant").using("btree", table.nextCreditGrant.asc().nullsLast().op("timestamptz_ops")).where(sql`(next_credit_grant IS NOT NULL)`),
	index("idx_credit_accounts_payment_status").using("btree", table.paymentStatus.asc().nullsLast().op("text_ops")).where(sql`(payment_status <> 'active'::text)`),
	index("idx_credit_accounts_plan_type").using("btree", table.planType.asc().nullsLast().op("text_ops")),
	index("idx_credit_accounts_provider").using("btree", table.provider.asc().nullsLast().op("text_ops")),
	index("idx_credit_accounts_revenuecat_cancel_at_period_end").using("btree", table.revenuecatCancelAtPeriodEnd.asc().nullsLast().op("timestamptz_ops")).where(sql`(revenuecat_cancel_at_period_end IS NOT NULL)`),
	index("idx_credit_accounts_revenuecat_customer").using("btree", table.revenuecatCustomerId.asc().nullsLast().op("text_ops")).where(sql`(revenuecat_customer_id IS NOT NULL)`),
	index("idx_credit_accounts_revenuecat_pending_change_date").using("btree", table.revenuecatPendingChangeDate.asc().nullsLast().op("timestamptz_ops")).where(sql`(revenuecat_pending_change_date IS NOT NULL)`),
	index("idx_credit_accounts_revenuecat_product_id").using("btree", table.revenuecatProductId.asc().nullsLast().op("text_ops")).where(sql`(revenuecat_product_id IS NOT NULL)`),
	index("idx_credit_accounts_scheduled_tier_change").using("btree", table.accountId.asc().nullsLast().op("text_ops"), table.scheduledTierChange.asc().nullsLast().op("uuid_ops")).where(sql`(scheduled_tier_change IS NOT NULL)`),
	index("idx_credit_accounts_stripe_subscription_id").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
	index("idx_credit_accounts_subscription_status").using("btree", table.stripeSubscriptionStatus.asc().nullsLast().op("text_ops")).where(sql`(stripe_subscription_status IS NOT NULL)`),
	index("idx_credit_accounts_tier").using("btree", table.tier.asc().nullsLast().op("text_ops")),
	index("idx_credit_accounts_trial_status").using("btree", table.trialStatus.asc().nullsLast().op("text_ops")).where(sql`((trial_status)::text <> 'none'::text)`),
	index("idx_credit_accounts_yearly_renewal").using("btree", table.planType.asc().nullsLast().op("timestamptz_ops"), table.nextCreditGrant.asc().nullsLast().op("timestamptz_ops")).where(sql`(((plan_type)::text = 'yearly'::text) AND (next_credit_grant IS NOT NULL))`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "credit_accounts_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role manages credit accounts", { as: "permissive", for: "all", to: ["service_role"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can view own credit account", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("team_members_can_view_credit_account", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("team_owners_can_manage_credits", { as: "permissive", for: "all", to: ["authenticated"] }),
	pgPolicy("users can view credit accounts", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("credit_accounts_payment_status_check", sql`payment_status = ANY (ARRAY['active'::text, 'failed'::text, 'pending'::text, 'past_due'::text])`),
	check("credit_accounts_plan_type_check", sql`(plan_type)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying, 'yearly_commitment'::character varying])::text[])`),
	check("credit_accounts_provider_check", sql`(provider)::text = ANY ((ARRAY['stripe'::character varying, 'revenuecat'::character varying, 'manual'::character varying])::text[])`),
	check("credit_accounts_trial_status_check", sql`(trial_status)::text = ANY ((ARRAY['none'::character varying, 'active'::character varying, 'expired'::character varying, 'converted'::character varying, 'cancelled'::character varying])::text[])`),
]);

export const referrals = pgTable("referrals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	referrerId: uuid("referrer_id").notNull(),
	referredAccountId: uuid("referred_account_id").notNull(),
	referralCode: text("referral_code").notNull(),
	creditsAwarded: numeric("credits_awarded", { precision: 12, scale:  4 }).default('0').notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_referrals_code").using("btree", table.referralCode.asc().nullsLast().op("text_ops")),
	index("idx_referrals_referred").using("btree", table.referredAccountId.asc().nullsLast().op("uuid_ops")),
	index("idx_referrals_referrer").using("btree", table.referrerId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_referrals_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.referredAccountId],
			foreignColumns: [users.id],
			name: "referrals_referred_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.referrerId],
			foreignColumns: [users.id],
			name: "referrals_referrer_id_fkey"
		}).onDelete("cascade"),
	unique("referrals_referred_account_id_key").on(table.referredAccountId),
	pgPolicy("Service role manages referrals", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.role() = 'service_role'::text)` }),
	pgPolicy("Users can view own referrals as referred", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can view own referrals as referrer", { as: "permissive", for: "select", to: ["public"] }),
	check("referrals_status_check", sql`status = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text])`),
]);

export const referralStats = pgTable("referral_stats", {
	accountId: uuid("account_id").primaryKey().notNull(),
	totalReferrals: integer("total_referrals").default(0).notNull(),
	successfulReferrals: integer("successful_referrals").default(0).notNull(),
	totalCreditsEarned: numeric("total_credits_earned", { precision: 12, scale:  4 }).default('0').notNull(),
	lastReferralAt: timestamp("last_referral_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "referral_stats_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role manages referral stats", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.role() = 'service_role'::text)` }),
	pgPolicy("Users can view own referral stats", { as: "permissive", for: "select", to: ["public"] }),
]);

export const userMemories = pgTable("user_memories", {
	memoryId: uuid("memory_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	content: text().notNull(),
	memoryType: memoryType("memory_type").default('fact').notNull(),
	embedding: vector({ dimensions: 1536 }),
	sourceThreadId: uuid("source_thread_id"),
	confidenceScore: doublePrecision("confidence_score").default(0.8),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_memories_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_memories_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_user_memories_embedding_vector").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	index("idx_user_memories_memory_type").using("btree", table.memoryType.asc().nullsLast().op("enum_ops")),
	index("idx_user_memories_source_thread").using("btree", table.sourceThreadId.asc().nullsLast().op("uuid_ops")).where(sql`(source_thread_id IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "fk_account"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceThreadId],
			foreignColumns: [threads.threadId],
			name: "fk_source_thread"
		}).onDelete("set null"),
	pgPolicy("Service role has full access to memories", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
	pgPolicy("Users can delete their own memories", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Users can insert their own memories", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Users can update their own memories", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own memories", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const memoryExtractionQueue = pgTable("memory_extraction_queue", {
	queueId: uuid("queue_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	threadId: uuid("thread_id").notNull(),
	messageIds: jsonb("message_ids").default([]).notNull(),
	status: memoryExtractionStatus().default('pending').notNull(),
	priority: integer().default(5),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_memory_queue_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_memory_queue_priority").using("btree", table.priority.desc().nullsFirst().op("int4_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_memory_queue_status").using("btree", table.status.asc().nullsLast().op("enum_ops")).where(sql`(status = ANY (ARRAY['pending'::memory_extraction_status, 'processing'::memory_extraction_status]))`),
	index("idx_memory_queue_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "fk_account"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "fk_thread"
		}).onDelete("cascade"),
	pgPolicy("Service role has full access to extraction queue", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
	pgPolicy("Users can view their own extraction queue", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const accountsInBasejump = basejump.table("accounts", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	primaryOwnerUserId: uuid("primary_owner_user_id").default(sql`auth.uid()`).notNull(),
	name: text(),
	slug: text(),
	personalAccount: boolean("personal_account").default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
	privateMetadata: jsonb("private_metadata").default({}),
	publicMetadata: jsonb("public_metadata").default({}),
	memoryEnabled: boolean("memory_enabled").default(true),
}, (table) => [
	index("idx_accounts_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_accounts_id_owner").using("btree", table.id.asc().nullsLast().op("uuid_ops"), table.primaryOwnerUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_accounts_memory_enabled").using("btree", table.id.asc().nullsLast().op("uuid_ops")).where(sql`(memory_enabled = false)`),
	index("idx_accounts_personal_owner").using("btree", table.personalAccount.asc().nullsLast().op("bool_ops"), table.primaryOwnerUserId.asc().nullsLast().op("bool_ops")).where(sql`(personal_account = true)`),
	index("idx_accounts_primary_owner").using("btree", table.primaryOwnerUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_accounts_primary_owner_user_id").using("btree", table.primaryOwnerUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_accounts_updated_by").using("btree", table.updatedBy.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "accounts_created_by_fkey"
		}),
	foreignKey({
			columns: [table.primaryOwnerUserId],
			foreignColumns: [users.id],
			name: "accounts_primary_owner_user_id_fkey"
		}),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "accounts_updated_by_fkey"
		}),
	unique("accounts_slug_key").on(table.slug),
	pgPolicy("Accounts are viewable by members", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((primary_owner_user_id = ( SELECT auth.uid() AS uid)) OR (basejump.has_role_on_account(id) = true))` }),
	pgPolicy("Accounts can be edited by owners", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Team accounts can be created by any user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	check("basejump_accounts_slug_null_if_personal_account_true", sql`((personal_account = true) AND (slug IS NULL)) OR ((personal_account = false) AND (slug IS NOT NULL))`),
]);

export const notificationSettings = pgTable("notification_settings", {
	accountId: uuid("account_id").primaryKey().notNull(),
	emailEnabled: boolean("email_enabled").default(true),
	pushEnabled: boolean("push_enabled").default(false),
	inAppEnabled: boolean("in_app_enabled").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "notification_settings_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Account members can manage notification settings", { as: "permissive", for: "all", to: ["public"], using: sql`basejump.has_role_on_account(account_id)` }),
]);

export const userPresenceSessions = pgTable("user_presence_sessions", {
	sessionId: uuid("session_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	activeThreadId: text("active_thread_id"),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }).defaultNow(),
	platform: text(),
	deviceInfo: jsonb("device_info").default({}),
	clientTimestamp: timestamp("client_timestamp", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_user_presence_sessions_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_presence_sessions_account_thread").using("btree", table.accountId.asc().nullsLast().op("text_ops"), table.activeThreadId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_presence_sessions_last_seen").using("btree", table.lastSeen.asc().nullsLast().op("timestamptz_ops")),
	index("idx_user_presence_sessions_thread_id").using("btree", table.activeThreadId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "user_presence_sessions_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Account members can manage presence sessions", { as: "permissive", for: "all", to: ["public"], using: sql`basejump.has_role_on_account(account_id)` }),
]);

export const deviceTokens = pgTable("device_tokens", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	deviceToken: text("device_token").notNull(),
	deviceType: text("device_type").notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_device_tokens_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_device_tokens_active").using("btree", table.accountId.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "device_tokens_account_id_fkey"
		}).onDelete("cascade"),
	unique("device_tokens_account_id_device_token_key").on(table.accountId, table.deviceToken),
	pgPolicy("Account members can manage device tokens", { as: "permissive", for: "all", to: ["public"], using: sql`basejump.has_role_on_account(account_id)` }),
]);

export const referralCodes = pgTable("referral_codes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	code: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiredAt: timestamp("expired_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_referral_codes_account").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_referral_codes_account_active").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.expiredAt.asc().nullsLast().op("uuid_ops")).where(sql`(expired_at IS NULL)`),
	index("idx_referral_codes_code").using("btree", table.code.asc().nullsLast().op("text_ops")),
	index("idx_referral_codes_expired").using("btree", table.expiredAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(expired_at IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [users.id],
			name: "referral_codes_account_id_fkey"
		}).onDelete("cascade"),
	unique("referral_codes_code_key").on(table.code),
	pgPolicy("Service role manages referral codes", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.role() = 'service_role'::text)` }),
	pgPolicy("Users can create own referral code", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can view own referral code", { as: "permissive", for: "select", to: ["public"] }),
]);

export const arrWeeklyActuals = pgTable("arr_weekly_actuals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	weekNumber: integer("week_number").notNull(),
	weekStartDate: date("week_start_date").notNull(),
	views: integer().default(0),
	signups: integer().default(0),
	newPaid: integer("new_paid").default(0),
	subscribers: integer().default(0),
	mrr: numeric({ precision: 12, scale:  2 }).default('0'),
	arr: numeric({ precision: 14, scale:  2 }).default('0'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	overrides: jsonb().default({}),
	churn: integer().default(0),
	platform: text().default('web').notNull(),
}, (table) => [
	index("idx_arr_weekly_actuals_week_platform").using("btree", table.weekNumber.asc().nullsLast().op("int4_ops"), table.platform.asc().nullsLast().op("int4_ops")),
	unique("arr_weekly_actuals_week_platform_key").on(table.weekNumber, table.platform),
	pgPolicy("Super admins can delete arr_weekly_actuals", { as: "permissive", for: "delete", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'super_admin'::user_role))))` }),
	pgPolicy("Super admins can insert arr_weekly_actuals", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Super admins can read arr_weekly_actuals", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Super admins can update arr_weekly_actuals", { as: "permissive", for: "update", to: ["public"] }),
	check("arr_weekly_actuals_platform_check", sql`platform = ANY (ARRAY['web'::text, 'app'::text])`),
	check("arr_weekly_actuals_week_number_check", sql`(week_number >= 1) AND (week_number <= 52)`),
]);

export const threads = pgTable("threads", {
	threadId: uuid("thread_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id"),
	projectId: uuid("project_id"),
	isPublic: boolean("is_public").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	metadata: jsonb().default({}),
	createdByUserId: uuid("created_by_user_id"),
	teamContext: jsonb("team_context").default({}),
	userMessageCount: integer("user_message_count").default(0),
	totalMessageCount: integer("total_message_count").default(0),
	status: threadStatus().default('ready'),
	initializationError: text("initialization_error"),
	initializationStartedAt: timestamp("initialization_started_at", { withTimezone: true, mode: 'string' }),
	initializationCompletedAt: timestamp("initialization_completed_at", { withTimezone: true, mode: 'string' }),
	memoryEnabled: boolean("memory_enabled").default(true),
	name: text().default('New Chat'),
	parentThreadId: uuid("parent_thread_id"),
	depthLevel: integer("depth_level").default(0),
}, (table) => [
	index("idx_threads_account_created_desc").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_threads_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_threads_account_id_created_at").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_threads_account_id_is_public").using("btree", table.accountId.asc().nullsLast().op("bool_ops"), table.isPublic.asc().nullsLast().op("uuid_ops")).where(sql`(is_public IS NOT NULL)`),
	index("idx_threads_account_project").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops"), table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_threads_account_status").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("idx_threads_account_updated_desc").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_threads_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_threads_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")).where(sql`(created_by_user_id IS NOT NULL)`),
	index("idx_threads_depth_level").using("btree", table.depthLevel.asc().nullsLast().op("int4_ops")).where(sql`(depth_level > 0)`),
	index("idx_threads_is_public_account_id").using("btree", table.isPublic.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("bool_ops")).where(sql`(is_public IS NOT NULL)`),
	index("idx_threads_memory_enabled").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")).where(sql`(memory_enabled = false)`),
	index("idx_threads_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_threads_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_threads_parent_thread_id").using("btree", table.parentThreadId.asc().nullsLast().op("uuid_ops")).where(sql`(parent_thread_id IS NOT NULL)`),
	index("idx_threads_project_account").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_threads_project_created").using("btree", table.projectId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_threads_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_threads_project_updated").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.updatedAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_threads_public").using("btree", table.isPublic.asc().nullsLast().op("bool_ops")).where(sql`(is_public = true)`),
	index("idx_threads_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("idx_threads_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")).where(sql`(thread_id IS NOT NULL)`),
	index("idx_threads_thread_id_account").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_threads_thread_id_account_project").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops"), table.projectId.asc().nullsLast().op("uuid_ops")).where(sql`(thread_id IS NOT NULL)`),
	index("idx_threads_thread_id_project").using("btree", table.threadId.asc().nullsLast().op("uuid_ops"), table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_threads_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_threads_user_message_count").using("btree", table.userMessageCount.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "threads_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "threads_created_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.parentThreadId],
			foreignColumns: [table.threadId],
			name: "threads_parent_thread_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.projectId],
			name: "threads_project_id_fkey"
		}).onDelete("cascade"),
	unique("threads_account_thread_unique").on(table.threadId, table.accountId),
	pgPolicy("thread_delete_policy", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = threads.account_id) AND (au.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))))` }),
	pgPolicy("thread_insert_policy", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("thread_select_policy", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
	pgPolicy("thread_update_policy", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("threads_depth_level_non_negative", sql`depth_level >= 0`),
]);

export const vercelAnalyticsDaily = pgTable("vercel_analytics_daily", {
	date: date().primaryKey().notNull(),
	deviceIds: text("device_ids").array().default([""]),
});

export const accountDeletionRequests = pgTable("account_deletion_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	userId: uuid("user_id").notNull(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletionScheduledFor: timestamp("deletion_scheduled_for", { withTimezone: true, mode: 'string' }).notNull(),
	reason: text(),
	isCancelled: boolean("is_cancelled").default(false),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	isDeleted: boolean("is_deleted").default(false),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_account_deletion_requests_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_account_deletion_requests_scheduled").using("btree", table.deletionScheduledFor.asc().nullsLast().op("timestamptz_ops")).where(sql`((is_cancelled = false) AND (is_deleted = false))`),
	index("idx_account_deletion_requests_status").using("btree", table.isCancelled.asc().nullsLast().op("bool_ops"), table.isDeleted.asc().nullsLast().op("bool_ops")),
	index("idx_account_deletion_requests_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("unique_active_deletion_request").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`((is_cancelled = false) AND (is_deleted = false))`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "account_deletion_requests_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "account_deletion_requests_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage deletion requests", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.role() = 'service_role'::text)` }),
	pgPolicy("Users can view their own deletion requests", { as: "permissive", for: "select", to: ["public"] }),
]);

export const arrSimulatorConfig = pgTable("arr_simulator_config", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startingSubs: integer("starting_subs").default(639),
	startingMrr: numeric("starting_mrr", { precision: 12, scale:  2 }).default('21646'),
	weeklyVisitors: integer("weekly_visitors").default(40000),
	landingConversion: numeric("landing_conversion", { precision: 5, scale:  2 }).default('25'),
	signupToPaid: numeric("signup_to_paid", { precision: 5, scale:  2 }).default('1'),
	arpu: numeric({ precision: 10, scale:  2 }).default('34'),
	monthlyChurn: numeric("monthly_churn", { precision: 5, scale:  2 }).default('25'),
	visitorGrowth: numeric("visitor_growth", { precision: 5, scale:  2 }).default('5'),
	targetArr: numeric("target_arr", { precision: 14, scale:  2 }).default('10000000'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy("Super admins can read arr_simulator_config", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'super_admin'::user_role))))` }),
	pgPolicy("Super admins can update arr_simulator_config", { as: "permissive", for: "update", to: ["public"] }),
]);

export const projectEmbeddings = pgTable("project_embeddings", {
	projectId: uuid("project_id").primaryKey().notNull(),
	embedding: vector({ dimensions: 1536 }),
	textHash: text("text_hash"),
	tokenCount: integer("token_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_project_embeddings_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_project_embeddings_vector").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.projectId],
			name: "project_embeddings_project_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role has full access to project_embeddings", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const taxonomyNodes = pgTable("taxonomy_nodes", {
	nodeId: uuid("node_id").defaultRandom().primaryKey().notNull(),
	parentId: uuid("parent_id"),
	level: integer().notNull(),
	label: text().notNull(),
	description: text(),
	centroid: vector({ dimensions: 1536 }),
	projectCount: integer("project_count").default(0),
	sampleTerms: text("sample_terms").array(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_taxonomy_nodes_centroid").using("ivfflat", table.centroid.asc().nullsLast().op("vector_cosine_ops")).with({lists: "50"}),
	index("idx_taxonomy_nodes_level").using("btree", table.level.asc().nullsLast().op("int4_ops")),
	index("idx_taxonomy_nodes_parent").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.nodeId],
			name: "taxonomy_nodes_parent_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role has full access to taxonomy_nodes", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
	check("taxonomy_nodes_level_check", sql`(level >= 0) AND (level <= 2)`),
]);

export const resources = pgTable("resources", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id"),
	type: text().notNull(),
	externalId: text("external_id"),
	status: text().default('active').notNull(),
	config: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	pooledAt: timestamp("pooled_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_resources_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_resources_external_id").using("btree", table.externalId.asc().nullsLast().op("text_ops")),
	index("idx_resources_external_id_type").using("btree", table.externalId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	index("idx_resources_id").using("btree", table.id.asc().nullsLast().op("uuid_ops")),
	index("idx_resources_pooled").using("btree", table.status.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("timestamptz_ops"), table.pooledAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((status = 'pooled'::text) AND (type = 'sandbox'::text))`),
	index("idx_resources_pooled_fifo").using("btree", table.pooledAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((status = 'pooled'::text) AND (type = 'sandbox'::text))`),
	index("idx_resources_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_resources_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "resources_account_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Account members can delete resources for their accounts", { as: "permissive", for: "delete", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM basejump.account_user
  WHERE ((account_user.account_id = resources.account_id) AND (account_user.user_id = auth.uid()))))` }),
	pgPolicy("Account members can insert resources for their accounts", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Account members can update resources for their accounts", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Account members can view resources for their accounts", { as: "permissive", for: "select", to: ["public"] }),
]);

export const benchmarkRuns = pgTable("benchmark_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runType: benchmarkRunType("run_type").notNull(),
	modelName: text("model_name").notNull(),
	concurrencyLevel: integer("concurrency_level").default(1).notNull(),
	totalPrompts: integer("total_prompts").default(0).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	status: benchmarkRunStatus().default('running').notNull(),
	metadata: jsonb().default({}),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_benchmark_runs_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_benchmark_runs_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_benchmark_runs_run_type").using("btree", table.runType.asc().nullsLast().op("enum_ops")),
	index("idx_benchmark_runs_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	pgPolicy("Admins can view benchmark_runs", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))` }),
	pgPolicy("Service role full access benchmark_runs", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("Service role has full access to benchmark_runs", { as: "permissive", for: "all", to: ["public"] }),
]);

export const benchmarkResults = pgTable("benchmark_results", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	promptId: text("prompt_id").notNull(),
	promptText: text("prompt_text").notNull(),
	threadId: uuid("thread_id"),
	agentRunId: uuid("agent_run_id"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	coldStartTimeMs: integer("cold_start_time_ms"),
	totalDurationMs: integer("total_duration_ms"),
	toolCallsCount: integer("tool_calls_count").default(0),
	toolCalls: jsonb("tool_calls").default([]),
	avgToolCallTimeMs: doublePrecision("avg_tool_call_time_ms"),
	slowestToolCall: jsonb("slowest_tool_call"),
	streamChunkCount: integer("stream_chunk_count").default(0),
	avgChunkIntervalMs: doublePrecision("avg_chunk_interval_ms"),
	status: benchmarkResultStatus().default('completed').notNull(),
	errorMessage: text("error_message"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	toolCallBreakdown: jsonb("tool_call_breakdown").default({}),
	expectedToolsPresent: boolean("expected_tools_present").default(true),
	missingTools: jsonb("missing_tools").default([]),
}, (table) => [
	index("idx_benchmark_results_prompt_id").using("btree", table.promptId.asc().nullsLast().op("text_ops")),
	index("idx_benchmark_results_run_id").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	index("idx_benchmark_results_started_at").using("btree", table.startedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_benchmark_results_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [benchmarkRuns.id],
			name: "benchmark_results_run_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins can view benchmark_results", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))` }),
	pgPolicy("Service role full access benchmark_results", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("Service role has full access to benchmark_results", { as: "permissive", for: "all", to: ["public"] }),
]);

export const arrDailyChurn = pgTable("arr_daily_churn", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	churnDate: date("churn_date").notNull(),
	deletedCount: integer("deleted_count").default(0),
	downgradeCount: integer("downgrade_count").default(0),
	totalCount: integer("total_count").generatedAlwaysAs(sql`(deleted_count + downgrade_count)`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_arr_daily_churn_date").using("btree", table.churnDate.asc().nullsLast().op("date_ops")),
	unique("arr_daily_churn_churn_date_key").on(table.churnDate),
	pgPolicy("Super admins can insert arr_daily_churn", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'super_admin'::user_role))))`  }),
	pgPolicy("Super admins can read arr_daily_churn", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Super admins can update arr_daily_churn", { as: "permissive", for: "update", to: ["public"] }),
]);

export const checkoutClicks = pgTable("checkout_clicks", {
	userId: uuid("user_id").primaryKey().notNull(),
	clickedAt: timestamp("clicked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "checkout_clicks_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can track their own checkout clicks", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
]);

export const archivedContext = pgTable("archived_context", {
	archiveId: uuid("archive_id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	accountId: uuid("account_id").notNull(),
	batchNumber: integer("batch_number").notNull(),
	messageCount: integer("message_count").notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	summary: text().notNull(),
	messages: jsonb().notNull(),
	embedding: vector({ dimensions: 1536 }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("idx_archived_context_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_archived_context_archived_at").using("btree", table.archivedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_archived_context_batch_number").using("btree", table.batchNumber.asc().nullsLast().op("int4_ops")),
	index("idx_archived_context_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_archived_context_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "archived_context_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "archived_context_thread_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("archived_context_delete_policy", { as: "permissive", for: "delete", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM threads
  WHERE ((threads.thread_id = archived_context.thread_id) AND (basejump.has_role_on_account(threads.account_id) = true))))` }),
	pgPolicy("archived_context_insert_policy", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("archived_context_select_policy", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("archived_context_update_policy", { as: "permissive", for: "update", to: ["public"] }),
]);

export const supportTickets = pgTable("support_tickets", {
	ticketId: uuid("ticket_id").defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	category: ticketCategory().default('general').notNull(),
	priority: ticketPriority().default('medium').notNull(),
	status: ticketStatus().default('open').notNull(),
	assignedTo: uuid("assigned_to"),
	resolutionSummary: text("resolution_summary"),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	publicId: text("public_id"),
}, (table) => [
	index("idx_support_tickets_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_support_tickets_account_ticket").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.ticketId.asc().nullsLast().op("uuid_ops")),
	index("idx_support_tickets_assigned_to").using("btree", table.assignedTo.asc().nullsLast().op("uuid_ops")),
	index("idx_support_tickets_category").using("btree", table.category.asc().nullsLast().op("enum_ops")),
	index("idx_support_tickets_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_support_tickets_priority").using("btree", table.priority.asc().nullsLast().op("enum_ops")),
	uniqueIndex("idx_support_tickets_public_id").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
	index("idx_support_tickets_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "support_tickets_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "support_tickets_assigned_to_fkey"
		}).onDelete("set null"),
	pgPolicy("Service role can manage all tickets", { as: "permissive", for: "all", to: ["public"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can create tickets", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update limited ticket fields", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own tickets", { as: "permissive", for: "select", to: ["public"] }),
]);

export const ticketMessages = pgTable("ticket_messages", {
	messageId: uuid("message_id").defaultRandom().primaryKey().notNull(),
	ticketId: uuid("ticket_id").notNull(),
	senderId: uuid("sender_id"),
	content: text().notNull(),
	messageType: ticketMessageType("message_type").default('user').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	emailMessageId: text("email_message_id"),
	emailInReplyTo: text("email_in_reply_to"),
	emailReferences: text("email_references").array(),
	source: text().default('app'),
	senderEmail: text("sender_email"),
}, (table) => [
	index("idx_ticket_messages_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("idx_ticket_messages_email_message_id").using("btree", table.emailMessageId.asc().nullsLast().op("text_ops")).where(sql`(email_message_id IS NOT NULL)`),
	index("idx_ticket_messages_in_reply_to").using("btree", table.emailInReplyTo.asc().nullsLast().op("text_ops")),
	index("idx_ticket_messages_sender_id").using("btree", table.senderId.asc().nullsLast().op("uuid_ops")),
	index("idx_ticket_messages_ticket_id").using("btree", table.ticketId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: "ticket_messages_sender_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ticketId],
			foreignColumns: [supportTickets.ticketId],
			name: "ticket_messages_ticket_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Service role can manage all messages", { as: "permissive", for: "all", to: ["public"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can create messages", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can view messages on their tickets", { as: "permissive", for: "select", to: ["public"] }),
	check("chk_message_type_email", sql`NOT ((source = 'email'::text) AND (message_type = 'internal_note'::ticket_message_type))`),
]);

export const ticketAttachments = pgTable("ticket_attachments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ticketId: uuid("ticket_id").notNull(),
	messageId: uuid("message_id"),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	storagePath: text("storage_path").notNull(),
	bucketName: varchar("bucket_name", { length: 100 }).default('ticket-attachments').notNull(),
	uploadedBy: uuid("uploaded_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ticket_attachments_message_id").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
	index("idx_ticket_attachments_ticket_id").using("btree", table.ticketId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.messageId],
			foreignColumns: [ticketMessages.messageId],
			name: "ticket_attachments_message_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ticketId],
			foreignColumns: [supportTickets.ticketId],
			name: "ticket_attachments_ticket_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "ticket_attachments_uploaded_by_fkey"
		}).onDelete("set null"),
	pgPolicy("Service role can manage all attachments", { as: "permissive", for: "all", to: ["public"], using: sql`(( SELECT auth.role() AS role) = 'service_role'::text)` }),
	pgPolicy("Users can upload attachments", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can view attachments on their tickets", { as: "permissive", for: "select", to: ["public"] }),
]);

export const documents = pgTable("documents", {
	chunkId: uuid("chunk_id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id"),
	accountId: uuid("account_id").notNull(),
	chunkContent: text("chunk_content"),
	embedding: vector({ dimensions: 1536 }),
	lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_documents_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_account_thread").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_documents_thread_id").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_user_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")).where(sql`(account_id IS NOT NULL)`),
	foreignKey({
			columns: [table.threadId, table.accountId],
			foreignColumns: [threads.threadId, threads.accountId],
			name: "documents_thread_account_fkey"
		}).onDelete("cascade"),
]);

export const accountUserInBasejump = basejump.table("account_user", {
	userId: uuid("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	accountRole: accountRoleInBasejump("account_role").notNull(),
}, (table) => [
	index("idx_account_user_account_id").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_account_user_composite").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.accountId.asc().nullsLast().op("uuid_ops")),
	index("idx_account_user_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_basejump_account_user_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountsInBasejump.id],
			name: "account_user_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "account_user_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.accountId], name: "account_user_pkey"}),
	pgPolicy("Account users can be deleted by owners except primary account o", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`((basejump.has_role_on_account(account_id, 'owner'::basejump.account_role) = true) AND (user_id <> ( SELECT accounts.primary_owner_user_id
   FROM basejump.accounts
  WHERE (account_user.account_id = accounts.id))))` }),
	pgPolicy("users can view account_users", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const projectTaxonomy = pgTable("project_taxonomy", {
	projectId: uuid("project_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	similarity: doublePrecision().notNull(),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_project_taxonomy_node").using("btree", table.nodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_project_taxonomy_similarity").using("btree", table.similarity.desc().nullsFirst().op("float8_ops")),
	foreignKey({
			columns: [table.nodeId],
			foreignColumns: [taxonomyNodes.nodeId],
			name: "project_taxonomy_node_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.projectId],
			name: "project_taxonomy_project_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.projectId, table.nodeId], name: "project_taxonomy_pkey"}),
	pgPolicy("Service role has full access to project_taxonomy", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
	check("project_taxonomy_similarity_check", sql`(similarity >= (0)::double precision) AND (similarity <= (1)::double precision)`),
]);

export const threadClusterAssignments = pgTable("thread_cluster_assignments", {
	threadId: uuid("thread_id").notNull(),
	runId: uuid("run_id").notNull(),
	clusterId: uuid("cluster_id"),
	distance: doublePrecision(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_thread_cluster_assignments_cluster").using("btree", table.clusterId.asc().nullsLast().op("uuid_ops")),
	index("idx_thread_cluster_assignments_run").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clusterId],
			foreignColumns: [threadClusters.clusterId],
			name: "thread_cluster_assignments_cluster_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [clusteringRuns.runId],
			name: "thread_cluster_assignments_run_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [threads.threadId],
			name: "thread_cluster_assignments_thread_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.threadId, table.runId], name: "thread_cluster_assignments_pkey"}),
	pgPolicy("Admin read access for thread_cluster_assignments", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))` }),
	pgPolicy("Service role bypass for thread_cluster_assignments", { as: "permissive", for: "all", to: ["public"] }),
]);
export const vCircuitBreakerStatus = pgView("v_circuit_breaker_status", {	circuitName: text("circuit_name"),
	state: text(),
	failureCount: integer("failure_count"),
	lastFailureTime: timestamp("last_failure_time", { withTimezone: true, mode: 'string' }),
	secondsSinceFailure: numeric("seconds_since_failure"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	secondsUntilRetry: numeric("seconds_until_retry"),
	statusDisplay: text("status_display"),
}).as(sql`SELECT circuit_breaker_state.circuit_name, circuit_breaker_state.state, circuit_breaker_state.failure_count, circuit_breaker_state.last_failure_time, CASE WHEN circuit_breaker_state.last_failure_time IS NOT NULL THEN EXTRACT(epoch FROM now() - circuit_breaker_state.last_failure_time) ELSE NULL::numeric END AS seconds_since_failure, circuit_breaker_state.updated_at, CASE WHEN circuit_breaker_state.state = 'open'::text AND circuit_breaker_state.last_failure_time IS NOT NULL THEN GREATEST(0::numeric, 60::numeric - EXTRACT(epoch FROM now() - circuit_breaker_state.last_failure_time)) ELSE NULL::numeric END AS seconds_until_retry, CASE WHEN circuit_breaker_state.state = 'closed'::text THEN '✅ Healthy'::text WHEN circuit_breaker_state.state = 'open'::text THEN '🔴 OPEN - Blocking requests'::text WHEN circuit_breaker_state.state = 'half_open'::text THEN '🟡 Testing recovery'::text ELSE NULL::text END AS status_display FROM circuit_breaker_state ORDER BY ( CASE circuit_breaker_state.state WHEN 'open'::text THEN 1 WHEN 'half_open'::text THEN 2 WHEN 'closed'::text THEN 3 ELSE NULL::integer END), circuit_breaker_state.circuit_name`);