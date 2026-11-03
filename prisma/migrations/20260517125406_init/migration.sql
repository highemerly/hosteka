-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatar" TEXT,
    "server" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT,
    "lastTermsAcceptedAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "ipAddresses" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "hashtags" TEXT,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "startTime" TEXT,
    "hasStartTime" BOOLEAN NOT NULL DEFAULT false,
    "endDate" TIMESTAMPTZ(3),
    "endTime" TEXT,
    "hasEndTime" BOOLEAN NOT NULL DEFAULT false,
    "location" VARCHAR(200),
    "maxParticipants" INTEGER,
    "isAllowedForFediverse" BOOLEAN NOT NULL DEFAULT true,
    "isAllowedForDiscord" BOOLEAN NOT NULL DEFAULT false,
    "isAllowedForTwitter" BOOLEAN NOT NULL DEFAULT false,
    "allowedFediverseServers" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT true,
    "registrationDeadlineDate" TIMESTAMPTZ(3),
    "registrationDeadlineTime" TEXT,
    "hasRegistrationDeadlineTime" BOOLEAN NOT NULL DEFAULT false,
    "fee" VARCHAR(200),
    "terms" TEXT,
    "relatedUrl" VARCHAR(200),
    "allowMaybe" BOOLEAN NOT NULL DEFAULT false,
    "allowParticipationRequest" BOOLEAN NOT NULL DEFAULT true,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "creatorId" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attending',
    "comment" VARCHAR(300),
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMPTZ(3),
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_option_groups" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "multipleChoice" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "event_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_options" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxParticipants" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "event_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_group_selections" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "participant_group_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_group_options" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "participant_group_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_events" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(200),
    "fee" VARCHAR(200),
    "relatedUrl" VARCHAR(200),
    "terms" TEXT,
    "isAllowedForFediverse" BOOLEAN NOT NULL DEFAULT true,
    "isAllowedForDiscord" BOOLEAN NOT NULL DEFAULT false,
    "isAllowedForTwitter" BOOLEAN NOT NULL DEFAULT false,
    "allowedFediverseServers" TEXT,
    "allowAutoRegistration" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "registrationDeadline" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "creatorId" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "pre_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_event_date_options" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "preEventId" TEXT NOT NULL,

    CONSTRAINT "pre_event_date_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_event_participants" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" VARCHAR(300),
    "autoRegisterWhenPromoted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "preEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateOptionId" TEXT NOT NULL,

    CONSTRAINT "pre_event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_terms_acceptances" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "service_terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "reporterId" TEXT NOT NULL,
    "eventId" TEXT,
    "preEventId" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "reason" TEXT,
    "bannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bannedByAdmin" TEXT,

    CONSTRAINT "banned_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendances" (
    "id" TEXT NOT NULL,
    "attendStatus" TEXT NOT NULL DEFAULT 'not_entered',
    "feeStatus" TEXT NOT NULL DEFAULT 'not_entered',
    "memo" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "event_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "relatedUrl" VARCHAR(500),
    "creatorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_admins" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "organization_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_server_key" ON "users"("username", "server");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_eventId_userId_key" ON "event_participants"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_group_selections_participantId_groupId_key" ON "participant_group_selections"("participantId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_group_options_selectionId_optionId_key" ON "participant_group_options"("selectionId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "pre_event_participants_preEventId_userId_dateOptionId_key" ON "pre_event_participants"("preEventId", "userId", "dateOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "banned_users_username_server_key" ON "banned_users"("username", "server");

-- CreateIndex
CREATE UNIQUE INDEX "event_attendances_eventId_userId_key" ON "event_attendances"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_admins_organizationId_userId_key" ON "organization_admins"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_option_groups" ADD CONSTRAINT "event_option_groups_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_options" ADD CONSTRAINT "event_options_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_options" ADD CONSTRAINT "event_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "event_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_group_selections" ADD CONSTRAINT "participant_group_selections_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_group_selections" ADD CONSTRAINT "participant_group_selections_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "event_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_group_options" ADD CONSTRAINT "participant_group_options_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "participant_group_selections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_group_options" ADD CONSTRAINT "participant_group_options_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "event_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_events" ADD CONSTRAINT "pre_events_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_events" ADD CONSTRAINT "pre_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_event_date_options" ADD CONSTRAINT "pre_event_date_options_preEventId_fkey" FOREIGN KEY ("preEventId") REFERENCES "pre_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_event_participants" ADD CONSTRAINT "pre_event_participants_preEventId_fkey" FOREIGN KEY ("preEventId") REFERENCES "pre_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_event_participants" ADD CONSTRAINT "pre_event_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_event_participants" ADD CONSTRAINT "pre_event_participants_dateOptionId_fkey" FOREIGN KEY ("dateOptionId") REFERENCES "pre_event_date_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_terms_acceptances" ADD CONSTRAINT "service_terms_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_preEventId_fkey" FOREIGN KEY ("preEventId") REFERENCES "pre_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_admins" ADD CONSTRAINT "organization_admins_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_admins" ADD CONSTRAINT "organization_admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
