import { relations } from "drizzle-orm/relations";
import { usersInAuth, userRoles, accountsInBasejump, fileUploads, agents, threads, adminActionsLog, agentVersions, creditLedger, apiKeys, vapiCalls, billingSubscriptionsInBasejump, billingCustomersInBasejump, invitationsInBasejump, auditLog, agentRuns, projects, resources, commitmentHistory, messages, archivedContext, userMcpCredentialProfiles, creditBalance, creditUsage, creditPurchases, agentTemplates, googleOauthTokens, feedback, agentTriggers, trialHistory, knowledgeBaseFolders, knowledgeBaseEntries, agentKnowledgeEntryAssignments, creditAccounts, dailyRefreshTracking, notifications, userNotificationPreferences, threadEmbeddings, conversationAnalytics, conversationAnalyticsQueue, pricingViews, referrals, referralStats, userMemories, memoryExtractionQueue, notificationSettings, userPresenceSessions, deviceTokens, referralCodes, accountDeletionRequests, projectEmbeddings, taxonomyNodes, benchmarkRuns, benchmarkResults, checkoutClicks, supportTickets, ticketMessages, ticketAttachments, documents, accountUserInBasejump, projectTaxonomy, threadClusters, threadClusterAssignments, clusteringRuns } from "./schema";

export const userRolesRelations = relations(userRoles, ({one}) => ({
	usersInAuth_grantedBy: one(usersInAuth, {
		fields: [userRoles.grantedBy],
		references: [usersInAuth.id],
		relationName: "userRoles_grantedBy_usersInAuth_id"
	}),
	usersInAuth_userId: one(usersInAuth, {
		fields: [userRoles.userId],
		references: [usersInAuth.id],
		relationName: "userRoles_userId_usersInAuth_id"
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	userRoles_grantedBy: many(userRoles, {
		relationName: "userRoles_grantedBy_usersInAuth_id"
	}),
	userRoles_userId: many(userRoles, {
		relationName: "userRoles_userId_usersInAuth_id"
	}),
	fileUploads: many(fileUploads),
	adminActionsLogs_adminUserId: many(adminActionsLog, {
		relationName: "adminActionsLog_adminUserId_usersInAuth_id"
	}),
	adminActionsLogs_targetUserId: many(adminActionsLog, {
		relationName: "adminActionsLog_targetUserId_usersInAuth_id"
	}),
	agents_createdByUserId: many(agents, {
		relationName: "agents_createdByUserId_usersInAuth_id"
	}),
	agents_updatedByUserId: many(agents, {
		relationName: "agents_updatedByUserId_usersInAuth_id"
	}),
	creditLedgers_createdBy: many(creditLedger, {
		relationName: "creditLedger_createdBy_usersInAuth_id"
	}),
	creditLedgers_triggeredByUserId: many(creditLedger, {
		relationName: "creditLedger_triggeredByUserId_usersInAuth_id"
	}),
	creditLedgers_accountId: many(creditLedger, {
		relationName: "creditLedger_accountId_usersInAuth_id"
	}),
	invitationsInBasejumps: many(invitationsInBasejump),
	auditLogs: many(auditLog),
	commitmentHistories: many(commitmentHistory),
	messages: many(messages),
	userMcpCredentialProfiles: many(userMcpCredentialProfiles),
	creditBalances: many(creditBalance),
	creditUsages: many(creditUsage),
	creditPurchases: many(creditPurchases),
	googleOauthTokens: many(googleOauthTokens),
	notifications_createdBy: many(notifications, {
		relationName: "notifications_createdBy_usersInAuth_id"
	}),
	notifications_userId: many(notifications, {
		relationName: "notifications_userId_usersInAuth_id"
	}),
	userNotificationPreferences: many(userNotificationPreferences),
	pricingViews: many(pricingViews),
	referrals_referredAccountId: many(referrals, {
		relationName: "referrals_referredAccountId_usersInAuth_id"
	}),
	referrals_referrerId: many(referrals, {
		relationName: "referrals_referrerId_usersInAuth_id"
	}),
	referralStats: many(referralStats),
	accountsInBasejumps_createdBy: many(accountsInBasejump, {
		relationName: "accountsInBasejump_createdBy_usersInAuth_id"
	}),
	accountsInBasejumps_primaryOwnerUserId: many(accountsInBasejump, {
		relationName: "accountsInBasejump_primaryOwnerUserId_usersInAuth_id"
	}),
	accountsInBasejumps_updatedBy: many(accountsInBasejump, {
		relationName: "accountsInBasejump_updatedBy_usersInAuth_id"
	}),
	referralCodes: many(referralCodes),
	threads: many(threads),
	accountDeletionRequests: many(accountDeletionRequests),
	checkoutClicks: many(checkoutClicks),
	supportTickets: many(supportTickets),
	ticketMessages: many(ticketMessages),
	ticketAttachments: many(ticketAttachments),
	accountUserInBasejumps: many(accountUserInBasejump),
}));

export const fileUploadsRelations = relations(fileUploads, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [fileUploads.accountId],
		references: [accountsInBasejump.id]
	}),
	agent: one(agents, {
		fields: [fileUploads.agentId],
		references: [agents.agentId]
	}),
	thread: one(threads, {
		fields: [fileUploads.threadId],
		references: [threads.threadId]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [fileUploads.userId],
		references: [usersInAuth.id]
	}),
}));

export const accountsInBasejumpRelations = relations(accountsInBasejump, ({one, many}) => ({
	fileUploads: many(fileUploads),
	agents: many(agents),
	creditLedgers: many(creditLedger),
	agentVersions: many(agentVersions),
	apiKeys: many(apiKeys),
	billingSubscriptionsInBasejumps: many(billingSubscriptionsInBasejump),
	invitationsInBasejumps: many(invitationsInBasejump),
	billingCustomersInBasejumps: many(billingCustomersInBasejump),
	projects: many(projects),
	agentTemplates: many(agentTemplates),
	feedbacks: many(feedback),
	trialHistories: many(trialHistory),
	knowledgeBaseFolders: many(knowledgeBaseFolders),
	knowledgeBaseEntries: many(knowledgeBaseEntries),
	agentKnowledgeEntryAssignments: many(agentKnowledgeEntryAssignments),
	notifications: many(notifications),
	userNotificationPreferences: many(userNotificationPreferences),
	creditAccounts: many(creditAccounts),
	userMemories: many(userMemories),
	memoryExtractionQueues: many(memoryExtractionQueue),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [accountsInBasejump.createdBy],
		references: [usersInAuth.id],
		relationName: "accountsInBasejump_createdBy_usersInAuth_id"
	}),
	usersInAuth_primaryOwnerUserId: one(usersInAuth, {
		fields: [accountsInBasejump.primaryOwnerUserId],
		references: [usersInAuth.id],
		relationName: "accountsInBasejump_primaryOwnerUserId_usersInAuth_id"
	}),
	usersInAuth_updatedBy: one(usersInAuth, {
		fields: [accountsInBasejump.updatedBy],
		references: [usersInAuth.id],
		relationName: "accountsInBasejump_updatedBy_usersInAuth_id"
	}),
	notificationSettings: many(notificationSettings),
	userPresenceSessions: many(userPresenceSessions),
	deviceTokens: many(deviceTokens),
	threads: many(threads),
	accountDeletionRequests: many(accountDeletionRequests),
	resources: many(resources),
	archivedContexts: many(archivedContext),
	supportTickets: many(supportTickets),
	accountUserInBasejumps: many(accountUserInBasejump),
}));

export const agentsRelations = relations(agents, ({one, many}) => ({
	fileUploads: many(fileUploads),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [agents.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth_createdByUserId: one(usersInAuth, {
		fields: [agents.createdByUserId],
		references: [usersInAuth.id],
		relationName: "agents_createdByUserId_usersInAuth_id"
	}),
	agentVersion: one(agentVersions, {
		fields: [agents.currentVersionId],
		references: [agentVersions.versionId],
		relationName: "agents_currentVersionId_agentVersions_versionId"
	}),
	usersInAuth_updatedByUserId: one(usersInAuth, {
		fields: [agents.updatedByUserId],
		references: [usersInAuth.id],
		relationName: "agents_updatedByUserId_usersInAuth_id"
	}),
	agentVersions: many(agentVersions, {
		relationName: "agentVersions_agentId_agents_agentId"
	}),
	vapiCalls: many(vapiCalls),
	agentRuns: many(agentRuns),
	messages: many(messages),
	agentTriggers: many(agentTriggers),
	agentKnowledgeEntryAssignments: many(agentKnowledgeEntryAssignments),
}));

export const threadsRelations = relations(threads, ({one, many}) => ({
	fileUploads: many(fileUploads),
	vapiCalls: many(vapiCalls),
	agentRuns: many(agentRuns),
	messages: many(messages),
	creditUsages: many(creditUsage),
	feedbacks: many(feedback),
	notifications: many(notifications),
	threadEmbeddings: many(threadEmbeddings),
	conversationAnalytics: many(conversationAnalytics),
	conversationAnalyticsQueues: many(conversationAnalyticsQueue),
	userMemories: many(userMemories),
	memoryExtractionQueues: many(memoryExtractionQueue),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [threads.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [threads.createdByUserId],
		references: [usersInAuth.id]
	}),
	thread: one(threads, {
		fields: [threads.parentThreadId],
		references: [threads.threadId],
		relationName: "threads_parentThreadId_threads_threadId"
	}),
	threads: many(threads, {
		relationName: "threads_parentThreadId_threads_threadId"
	}),
	project: one(projects, {
		fields: [threads.projectId],
		references: [projects.projectId]
	}),
	archivedContexts: many(archivedContext),
	documents: many(documents),
	threadClusterAssignments: many(threadClusterAssignments),
}));

export const adminActionsLogRelations = relations(adminActionsLog, ({one}) => ({
	usersInAuth_adminUserId: one(usersInAuth, {
		fields: [adminActionsLog.adminUserId],
		references: [usersInAuth.id],
		relationName: "adminActionsLog_adminUserId_usersInAuth_id"
	}),
	usersInAuth_targetUserId: one(usersInAuth, {
		fields: [adminActionsLog.targetUserId],
		references: [usersInAuth.id],
		relationName: "adminActionsLog_targetUserId_usersInAuth_id"
	}),
}));

export const agentVersionsRelations = relations(agentVersions, ({one, many}) => ({
	agents: many(agents, {
		relationName: "agents_currentVersionId_agentVersions_versionId"
	}),
	agent: one(agents, {
		fields: [agentVersions.agentId],
		references: [agents.agentId],
		relationName: "agentVersions_agentId_agents_agentId"
	}),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [agentVersions.createdBy],
		references: [accountsInBasejump.id]
	}),
	agentVersion: one(agentVersions, {
		fields: [agentVersions.previousVersionId],
		references: [agentVersions.versionId],
		relationName: "agentVersions_previousVersionId_agentVersions_versionId"
	}),
	agentVersions: many(agentVersions, {
		relationName: "agentVersions_previousVersionId_agentVersions_versionId"
	}),
	agentRuns: many(agentRuns),
	messages: many(messages),
}));

export const creditLedgerRelations = relations(creditLedger, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [creditLedger.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [creditLedger.createdBy],
		references: [usersInAuth.id],
		relationName: "creditLedger_createdBy_usersInAuth_id"
	}),
	usersInAuth_triggeredByUserId: one(usersInAuth, {
		fields: [creditLedger.triggeredByUserId],
		references: [usersInAuth.id],
		relationName: "creditLedger_triggeredByUserId_usersInAuth_id"
	}),
	usersInAuth_accountId: one(usersInAuth, {
		fields: [creditLedger.accountId],
		references: [usersInAuth.id],
		relationName: "creditLedger_accountId_usersInAuth_id"
	}),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [apiKeys.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const vapiCallsRelations = relations(vapiCalls, ({one}) => ({
	agent: one(agents, {
		fields: [vapiCalls.agentId],
		references: [agents.agentId]
	}),
	thread: one(threads, {
		fields: [vapiCalls.threadId],
		references: [threads.threadId]
	}),
}));

export const billingSubscriptionsInBasejumpRelations = relations(billingSubscriptionsInBasejump, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [billingSubscriptionsInBasejump.accountId],
		references: [accountsInBasejump.id]
	}),
	billingCustomersInBasejump: one(billingCustomersInBasejump, {
		fields: [billingSubscriptionsInBasejump.billingCustomerId],
		references: [billingCustomersInBasejump.id]
	}),
}));

export const billingCustomersInBasejumpRelations = relations(billingCustomersInBasejump, ({one, many}) => ({
	billingSubscriptionsInBasejumps: many(billingSubscriptionsInBasejump),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [billingCustomersInBasejump.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const invitationsInBasejumpRelations = relations(invitationsInBasejump, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [invitationsInBasejump.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [invitationsInBasejump.invitedByUserId],
		references: [usersInAuth.id]
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [auditLog.accountId],
		references: [usersInAuth.id]
	}),
}));

export const agentRunsRelations = relations(agentRuns, ({one, many}) => ({
	agent: one(agents, {
		fields: [agentRuns.agentId],
		references: [agents.agentId]
	}),
	agentVersion: one(agentVersions, {
		fields: [agentRuns.agentVersionId],
		references: [agentVersions.versionId]
	}),
	thread: one(threads, {
		fields: [agentRuns.threadId],
		references: [threads.threadId]
	}),
	notifications: many(notifications),
	conversationAnalytics: many(conversationAnalytics),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [projects.accountId],
		references: [accountsInBasejump.id]
	}),
	resource: one(resources, {
		fields: [projects.sandboxResourceId],
		references: [resources.id]
	}),
	threads: many(threads),
	projectEmbeddings: many(projectEmbeddings),
	projectTaxonomies: many(projectTaxonomy),
}));

export const resourcesRelations = relations(resources, ({one, many}) => ({
	projects: many(projects),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [resources.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const commitmentHistoryRelations = relations(commitmentHistory, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [commitmentHistory.accountId],
		references: [usersInAuth.id]
	}),
}));

export const messagesRelations = relations(messages, ({one, many}) => ({
	agent: one(agents, {
		fields: [messages.agentId],
		references: [agents.agentId]
	}),
	agentVersion: one(agentVersions, {
		fields: [messages.agentVersionId],
		references: [agentVersions.versionId]
	}),
	archivedContext: one(archivedContext, {
		fields: [messages.archiveId],
		references: [archivedContext.archiveId]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [messages.createdByUserId],
		references: [usersInAuth.id]
	}),
	thread: one(threads, {
		fields: [messages.threadId],
		references: [threads.threadId]
	}),
	creditUsages: many(creditUsage),
	feedbacks: many(feedback),
}));

export const archivedContextRelations = relations(archivedContext, ({one, many}) => ({
	messages: many(messages),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [archivedContext.accountId],
		references: [accountsInBasejump.id]
	}),
	thread: one(threads, {
		fields: [archivedContext.threadId],
		references: [threads.threadId]
	}),
}));

export const userMcpCredentialProfilesRelations = relations(userMcpCredentialProfiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userMcpCredentialProfiles.accountId],
		references: [usersInAuth.id]
	}),
}));

export const creditBalanceRelations = relations(creditBalance, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [creditBalance.accountId],
		references: [usersInAuth.id]
	}),
}));

export const creditUsageRelations = relations(creditUsage, ({one}) => ({
	message: one(messages, {
		fields: [creditUsage.messageId],
		references: [messages.messageId]
	}),
	thread: one(threads, {
		fields: [creditUsage.threadId],
		references: [threads.threadId]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [creditUsage.accountId],
		references: [usersInAuth.id]
	}),
}));

export const creditPurchasesRelations = relations(creditPurchases, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [creditPurchases.accountId],
		references: [usersInAuth.id]
	}),
}));

export const agentTemplatesRelations = relations(agentTemplates, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [agentTemplates.creatorId],
		references: [accountsInBasejump.id]
	}),
}));

export const googleOauthTokensRelations = relations(googleOauthTokens, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [googleOauthTokens.userId],
		references: [usersInAuth.id]
	}),
}));

export const feedbackRelations = relations(feedback, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [feedback.accountId],
		references: [accountsInBasejump.id]
	}),
	message: one(messages, {
		fields: [feedback.messageId],
		references: [messages.messageId]
	}),
	thread: one(threads, {
		fields: [feedback.threadId],
		references: [threads.threadId]
	}),
}));

export const agentTriggersRelations = relations(agentTriggers, ({one}) => ({
	agent: one(agents, {
		fields: [agentTriggers.agentId],
		references: [agents.agentId]
	}),
}));

export const trialHistoryRelations = relations(trialHistory, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [trialHistory.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const knowledgeBaseFoldersRelations = relations(knowledgeBaseFolders, ({one, many}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [knowledgeBaseFolders.accountId],
		references: [accountsInBasejump.id]
	}),
	knowledgeBaseEntries: many(knowledgeBaseEntries),
}));

export const knowledgeBaseEntriesRelations = relations(knowledgeBaseEntries, ({one, many}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [knowledgeBaseEntries.accountId],
		references: [accountsInBasejump.id]
	}),
	knowledgeBaseFolder: one(knowledgeBaseFolders, {
		fields: [knowledgeBaseEntries.folderId],
		references: [knowledgeBaseFolders.folderId]
	}),
	agentKnowledgeEntryAssignments: many(agentKnowledgeEntryAssignments),
}));

export const agentKnowledgeEntryAssignmentsRelations = relations(agentKnowledgeEntryAssignments, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [agentKnowledgeEntryAssignments.accountId],
		references: [accountsInBasejump.id]
	}),
	agent: one(agents, {
		fields: [agentKnowledgeEntryAssignments.agentId],
		references: [agents.agentId]
	}),
	knowledgeBaseEntry: one(knowledgeBaseEntries, {
		fields: [agentKnowledgeEntryAssignments.entryId],
		references: [knowledgeBaseEntries.entryId]
	}),
}));

export const dailyRefreshTrackingRelations = relations(dailyRefreshTracking, ({one}) => ({
	creditAccount: one(creditAccounts, {
		fields: [dailyRefreshTracking.accountId],
		references: [creditAccounts.accountId]
	}),
}));

export const creditAccountsRelations = relations(creditAccounts, ({one, many}) => ({
	dailyRefreshTrackings: many(dailyRefreshTracking),
	accountsInBasejump: one(accountsInBasejump, {
		fields: [creditAccounts.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [notifications.accountId],
		references: [accountsInBasejump.id]
	}),
	agentRun: one(agentRuns, {
		fields: [notifications.agentRunId],
		references: [agentRuns.id]
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [notifications.createdBy],
		references: [usersInAuth.id],
		relationName: "notifications_createdBy_usersInAuth_id"
	}),
	thread: one(threads, {
		fields: [notifications.threadId],
		references: [threads.threadId]
	}),
	usersInAuth_userId: one(usersInAuth, {
		fields: [notifications.userId],
		references: [usersInAuth.id],
		relationName: "notifications_userId_usersInAuth_id"
	}),
}));

export const userNotificationPreferencesRelations = relations(userNotificationPreferences, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [userNotificationPreferences.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [userNotificationPreferences.userId],
		references: [usersInAuth.id]
	}),
}));

export const threadEmbeddingsRelations = relations(threadEmbeddings, ({one}) => ({
	thread: one(threads, {
		fields: [threadEmbeddings.threadId],
		references: [threads.threadId]
	}),
}));

export const conversationAnalyticsRelations = relations(conversationAnalytics, ({one}) => ({
	agentRun: one(agentRuns, {
		fields: [conversationAnalytics.agentRunId],
		references: [agentRuns.id]
	}),
	thread: one(threads, {
		fields: [conversationAnalytics.threadId],
		references: [threads.threadId]
	}),
}));

export const conversationAnalyticsQueueRelations = relations(conversationAnalyticsQueue, ({one}) => ({
	thread: one(threads, {
		fields: [conversationAnalyticsQueue.threadId],
		references: [threads.threadId]
	}),
}));

export const pricingViewsRelations = relations(pricingViews, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [pricingViews.userId],
		references: [usersInAuth.id]
	}),
}));

export const referralsRelations = relations(referrals, ({one}) => ({
	usersInAuth_referredAccountId: one(usersInAuth, {
		fields: [referrals.referredAccountId],
		references: [usersInAuth.id],
		relationName: "referrals_referredAccountId_usersInAuth_id"
	}),
	usersInAuth_referrerId: one(usersInAuth, {
		fields: [referrals.referrerId],
		references: [usersInAuth.id],
		relationName: "referrals_referrerId_usersInAuth_id"
	}),
}));

export const referralStatsRelations = relations(referralStats, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [referralStats.accountId],
		references: [usersInAuth.id]
	}),
}));

export const userMemoriesRelations = relations(userMemories, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [userMemories.accountId],
		references: [accountsInBasejump.id]
	}),
	thread: one(threads, {
		fields: [userMemories.sourceThreadId],
		references: [threads.threadId]
	}),
}));

export const memoryExtractionQueueRelations = relations(memoryExtractionQueue, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [memoryExtractionQueue.accountId],
		references: [accountsInBasejump.id]
	}),
	thread: one(threads, {
		fields: [memoryExtractionQueue.threadId],
		references: [threads.threadId]
	}),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [notificationSettings.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const userPresenceSessionsRelations = relations(userPresenceSessions, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [userPresenceSessions.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const deviceTokensRelations = relations(deviceTokens, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [deviceTokens.accountId],
		references: [accountsInBasejump.id]
	}),
}));

export const referralCodesRelations = relations(referralCodes, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [referralCodes.accountId],
		references: [usersInAuth.id]
	}),
}));

export const accountDeletionRequestsRelations = relations(accountDeletionRequests, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [accountDeletionRequests.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [accountDeletionRequests.userId],
		references: [usersInAuth.id]
	}),
}));

export const projectEmbeddingsRelations = relations(projectEmbeddings, ({one}) => ({
	project: one(projects, {
		fields: [projectEmbeddings.projectId],
		references: [projects.projectId]
	}),
}));

export const taxonomyNodesRelations = relations(taxonomyNodes, ({one, many}) => ({
	taxonomyNode: one(taxonomyNodes, {
		fields: [taxonomyNodes.parentId],
		references: [taxonomyNodes.nodeId],
		relationName: "taxonomyNodes_parentId_taxonomyNodes_nodeId"
	}),
	taxonomyNodes: many(taxonomyNodes, {
		relationName: "taxonomyNodes_parentId_taxonomyNodes_nodeId"
	}),
	projectTaxonomies: many(projectTaxonomy),
}));

export const benchmarkResultsRelations = relations(benchmarkResults, ({one}) => ({
	benchmarkRun: one(benchmarkRuns, {
		fields: [benchmarkResults.runId],
		references: [benchmarkRuns.id]
	}),
}));

export const benchmarkRunsRelations = relations(benchmarkRuns, ({many}) => ({
	benchmarkResults: many(benchmarkResults),
}));

export const checkoutClicksRelations = relations(checkoutClicks, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [checkoutClicks.userId],
		references: [usersInAuth.id]
	}),
}));

export const supportTicketsRelations = relations(supportTickets, ({one, many}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [supportTickets.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [supportTickets.assignedTo],
		references: [usersInAuth.id]
	}),
	ticketMessages: many(ticketMessages),
	ticketAttachments: many(ticketAttachments),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [ticketMessages.senderId],
		references: [usersInAuth.id]
	}),
	supportTicket: one(supportTickets, {
		fields: [ticketMessages.ticketId],
		references: [supportTickets.ticketId]
	}),
	ticketAttachments: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({one}) => ({
	ticketMessage: one(ticketMessages, {
		fields: [ticketAttachments.messageId],
		references: [ticketMessages.messageId]
	}),
	supportTicket: one(supportTickets, {
		fields: [ticketAttachments.ticketId],
		references: [supportTickets.ticketId]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [ticketAttachments.uploadedBy],
		references: [usersInAuth.id]
	}),
}));

export const documentsRelations = relations(documents, ({one}) => ({
	thread: one(threads, {
		fields: [documents.threadId],
		references: [threads.threadId]
	}),
}));

export const accountUserInBasejumpRelations = relations(accountUserInBasejump, ({one}) => ({
	accountsInBasejump: one(accountsInBasejump, {
		fields: [accountUserInBasejump.accountId],
		references: [accountsInBasejump.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [accountUserInBasejump.userId],
		references: [usersInAuth.id]
	}),
}));

export const projectTaxonomyRelations = relations(projectTaxonomy, ({one}) => ({
	taxonomyNode: one(taxonomyNodes, {
		fields: [projectTaxonomy.nodeId],
		references: [taxonomyNodes.nodeId]
	}),
	project: one(projects, {
		fields: [projectTaxonomy.projectId],
		references: [projects.projectId]
	}),
}));

export const threadClusterAssignmentsRelations = relations(threadClusterAssignments, ({one}) => ({
	threadCluster: one(threadClusters, {
		fields: [threadClusterAssignments.clusterId],
		references: [threadClusters.clusterId]
	}),
	clusteringRun: one(clusteringRuns, {
		fields: [threadClusterAssignments.runId],
		references: [clusteringRuns.runId]
	}),
	thread: one(threads, {
		fields: [threadClusterAssignments.threadId],
		references: [threads.threadId]
	}),
}));

export const threadClustersRelations = relations(threadClusters, ({many}) => ({
	threadClusterAssignments: many(threadClusterAssignments),
}));

export const clusteringRunsRelations = relations(clusteringRuns, ({many}) => ({
	threadClusterAssignments: many(threadClusterAssignments),
}));