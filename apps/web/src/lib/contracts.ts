export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED";
export type GroupType = "DIRECTION" | "GRADE" | "FUNCTIONAL" | "SYSTEM";
export type MembershipRole = "MEMBER" | "MANAGER";
export type MailboxProvisioningStatus = "PENDING" | "PROVISIONED" | "FAILED";
export type ArchivedContentRestoreTarget = "LAB_ADMIN" | "DIRECTION_ADMIN";
export type InternalMailRecipientType = "SENDER" | "TO" | "CC";
export type InternalMailDeliverySourceType = "USER" | "GROUP";
export type AuditLogStatus = "SUCCESS" | "FAILURE" | "DENIED";

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    users: number;
  };
}

export interface GroupSummary {
  id: string;
  code: string;
  name: string;
  type: GroupType;
  description: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  parent: {
    id: string;
    code: string;
    name: string;
    type: GroupType;
    description: string | null;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  _count: {
    memberships: number;
    children: number;
    knowledgeSpaces: number;
  };
}

export interface UserSummary {
  id: string;
  username: string | null;
  email: string;
  notificationEmail: string | null;
  realName: string;
  studentId: string | null;
  avatarUrl: string | null;
  bio: string | null;
  emailReminderEnabled: boolean;
  lastExternalMailReminderAt: string | null;
  keycloakUserId: string | null;
  mustChangePassword: boolean;
  mailboxProvisioningStatus: MailboxProvisioningStatus;
  mailboxProvisionedAt: string | null;
  mailboxLastError: string | null;
  status: UserStatus;
  archivedAt: string | null;
  archiveExpiresAt: string | null;
  contentRestoredAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    id: string;
    userId: string;
    groupId: string;
    membershipRole: MembershipRole;
    joinedAt: string;
    group: {
      id: string;
      code: string;
      name: string;
      type: GroupType;
      description: string | null;
      parentId: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }>;
  roles: Array<{
    id: string;
    userId: string;
    roleId: string;
    assignedAt: string;
    role: {
      id: string;
      code: string;
      name: string;
      description: string | null;
      isSystem: boolean;
      createdAt: string;
      updatedAt: string;
    };
  }>;
}

export interface AuthUser {
  id: string;
  username: string | null;
  email: string;
  realName: string;
  status: UserStatus;
  mustChangePassword: boolean;
  roleCodes: string[];
  groupIds: string[];
  memberships: Array<{
    groupId: string;
    group: {
      id: string;
      name: string;
      type: GroupType;
    };
  }>;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface OrganizationSummary {
  userCount: number;
  pendingUserCount: number;
  roleCount: number;
  groupCount: number;
  directionCount: number;
  gradeCount: number;
}

export interface CreateUserPayload {
  realName: string;
  namePinyin: string;
  password: string;
  notificationEmail: string;
  avatarUrl?: string;
  bio?: string;
  groupIds?: string[];
}

export interface RegisterPrefixCheckPayload {
  namePinyin: string;
}

export interface RegisterPrefixCheckResult {
  prefix: string;
  email: string;
  available: boolean;
  message: string;
}

export interface RegisterOptions {
  groups: Array<{
    id: string;
    code: string;
    name: string;
    type: GroupType;
  }>;
  mailDomain: string;
}

export interface UserDirectoryResult {
  items: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface BatchGenerateUsersPayload {
  groupIds: string[];
  password: string;
  users: Array<{
    realName: string;
    notificationEmail: string;
  }>;
}

export interface BatchGeneratedUserResult {
  temporaryPassword: string;
  user: UserSummary;
}

export interface BatchGenerateUsersResult {
  createdUsers: BatchGeneratedUserResult[];
  failedUsers: Array<{
    realName: string;
    notificationEmail?: string;
    reason: string;
  }>;
}

export interface ReviewUserPayload {
  status: UserStatus;
  roleIds?: string[];
  groupIds?: string[];
  notificationEmail?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ResetUserPasswordPayload {
  password?: string;
}

export interface ResetUserPasswordResult {
  temporaryPassword: string;
  user: UserSummary;
}

export interface RestoreArchivedContentPayload {
  target: ArchivedContentRestoreTarget;
}

export interface AuditLogItem {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  status: AuditLogStatus;
  summary: string;
  metadata: unknown;
  ipAddress: string | null;
  countryCode: string | null;
  userAgent: string | null;
  workspaceId: string | null;
  createdAt: string;
  actor: {
    id: string;
    realName: string;
    email: string;
    username: string | null;
  } | null;
}

export interface AuditLogResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface CreateRolePayload {
  code: string;
  name: string;
  description?: string;
  isSystem?: boolean;
}

export interface CreateGroupPayload {
  code: string;
  name: string;
  type: GroupType;
  description?: string;
  parentId?: string;
}

export interface BootstrapDirectionGroupsResult {
  createdGroupCount: number;
  updatedGroupCount: number;
  createdSpaceCount: number;
  updatedSpaceCount: number;
  groups: GroupSummary[];
  spaces: KnowledgeSpaceSummary[];
}

export interface BootstrapDirectionGroupsStatus {
  available: boolean;
  groupCount: number;
  knowledgeSpaceCount: number;
  reason: string | null;
}

export interface AddGroupMemberPayload {
  userId: string;
  membershipRole: MembershipRole;
}

export type SpaceVisibility = "PUBLIC" | "PRIVATE" | "GROUP_RESTRICTED";
export type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type KnowledgePageAccessRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";
export type KnowledgePageAccessApproverKind =
  | "PAGE_OWNER"
  | "SPACE_OWNER"
  | "LAB_ADMIN";
export type KnowledgeApprovalSection =
  | "pendingReviews"
  | "submitted"
  | "reviewedByMe";

export interface KnowledgeSpaceAccessGroupSummary {
  id: string;
  spaceId: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
  group: GroupSummary;
}

export interface KnowledgeSpaceParentSummary {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: SpaceVisibility;
  ownerGroupId: string | null;
  parentSpaceId: string | null;
  deletedAt: string | null;
  deleteExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSpaceSummary {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: SpaceVisibility;
  ownerGroupId: string | null;
  parentSpaceId: string | null;
  deletedAt: string | null;
  deleteExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerGroup: GroupSummary["parent"];
  parentSpace: KnowledgeSpaceParentSummary | null;
  accessGroups: KnowledgeSpaceAccessGroupSummary[];
  _count: {
    pages: number;
    childSpaces: number;
  };
}

export interface KnowledgePageSummary {
  id: string;
  spaceId: string;
  parentId: string | null;
  authorId: string | null;
  editorId: string | null;
  title: string;
  slug: string;
  summary: string | null;
  contentMd: string;
  contentRawJson: unknown;
  tags: string[];
  status: PageStatus;
  sortOrder: number;
  publishedAt: string | null;
  deletedAt: string | null;
  deleteExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  space: {
    id: string;
    code: string;
    slug: string;
    name: string;
    description: string | null;
    visibility: SpaceVisibility;
    ownerGroupId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  parent?: {
    id: string;
    title: string;
    slug: string;
    parentId: string | null;
  } | null;
  author: {
    id: string;
    realName: string;
    email: string;
  } | null;
  editor: {
    id: string;
    realName: string;
    email: string;
  } | null;
  editPermission?: {
    canEdit: boolean;
    canDelete: boolean;
    canManagePermissions: boolean;
    pendingRequest: {
      id: string;
      reviewerId: string;
      reviewerKind: KnowledgePageAccessApproverKind;
      status: KnowledgePageAccessRequestStatus;
      reason: string | null;
      createdAt: string;
      reviewer: {
        id: string;
        realName: string;
        email: string;
      };
    } | null;
    availableApprovalTargets: KnowledgePageApprovalTarget[];
  };
}

export interface KnowledgeSpaceDetail extends KnowledgeSpaceSummary {
  childSpaces: KnowledgeSpaceSummary[];
  management: {
    canManageSubspaces: boolean;
    canManageAccess: boolean;
    availableGradeGroups: GroupSummary[];
  };
  pages: Array<{
    id: string;
    spaceId: string;
    parentId: string | null;
    authorId: string | null;
    editorId: string | null;
    title: string;
    slug: string;
    summary: string | null;
    contentMd: string;
    contentRawJson: unknown;
    tags: string[];
    status: PageStatus;
    sortOrder: number;
    publishedAt: string | null;
    deletedAt: string | null;
    deleteExpiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface CreateKnowledgeSpacePayload {
  code: string;
  name: string;
  description?: string;
  visibility?: SpaceVisibility;
  ownerGroupId?: string;
  parentSpaceId?: string;
  accessGroupIds?: string[];
}

export interface CreateKnowledgePagePayload {
  spaceId: string;
  parentId?: string;
  title: string;
  summary?: string;
  contentMd: string;
  tags?: string[];
  status?: PageStatus;
}

export interface UpdateKnowledgePagePayload {
  parentId?: string | null;
  title?: string;
  summary?: string;
  contentMd?: string;
  contentRawJson?: unknown;
  tags?: string[];
  status?: PageStatus;
}

export interface KnowledgeImageUploadResult {
  url: string;
  key: string;
  contentType: string;
  width: number | null;
  height: number | null;
  size: number;
}

export interface KnowledgePageApprovalTarget {
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewerKind: KnowledgePageAccessApproverKind;
}

export interface CreateKnowledgePageAccessRequestPayload {
  pageId: string;
  reviewerId: string;
  reviewerKind: KnowledgePageAccessApproverKind;
  reason?: string;
}

export interface ReviewKnowledgePageAccessRequestPayload {
  action: "APPROVE" | "REJECT";
  comment?: string;
}

export interface GrantKnowledgePagePermissionPayload {
  userId: string;
  comment?: string;
}

export interface GrantKnowledgeSpaceAccessGroupPayload {
  groupId: string;
}

export interface KnowledgePageAccessRequestSummary {
  id: string;
  pageId: string;
  requesterId: string;
  reviewerId: string;
  reviewerKind: KnowledgePageAccessApproverKind;
  status: KnowledgePageAccessRequestStatus;
  reason: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  grantActive?: boolean;
  page: {
    id: string;
    title: string;
    spaceId: string;
    space: {
      id: string;
      name: string;
    };
  };
  requester: {
    id: string;
    realName: string;
    email: string;
  };
  reviewer: {
    id: string;
    realName: string;
    email: string;
  };
}

export interface KnowledgePageAccessRequestDashboard {
  summary: {
    pendingReviews: number;
    submitted: number;
    reviewedByMe: number;
  };
  section: KnowledgeApprovalSection;
  filters: {
    q: string | null;
    status: KnowledgePageAccessRequestStatus | null;
    reviewerKind: KnowledgePageAccessApproverKind | null;
    page: number;
    pageSize: number;
  };
  records: {
    items: KnowledgePageAccessRequestSummary[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}

export interface KnowledgePagePermissionGrantSummary {
  id: string;
  pageId: string;
  userId: string;
  grantedById: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    realName: string;
    email: string;
  };
  grantedBy: {
    id: string;
    realName: string;
    email: string;
  };
}

export interface KnowledgePagePermissionManagement {
  canManage: boolean;
  grants: KnowledgePagePermissionGrantSummary[];
  availableUsers: Array<{
    id: string;
    realName: string;
    email: string;
  }>;
}

export interface InternalMailUserOption {
  id: string;
  username: string | null;
  email: string;
  realName: string;
}

export interface InternalMailComposerUserOption extends InternalMailUserOption {
  memberships: Array<{
    group: {
      id: string;
      name: string;
      type: GroupType;
    };
  }>;
}

export interface InternalMailGroupOption {
  id: string;
  code: string;
  name: string;
  type: GroupType;
}

export interface InternalMailComposerOptions {
  users: InternalMailComposerUserOption[];
  groups: InternalMailGroupOption[];
}

export interface InternalMailSummary {
  inbox: number;
  unread: number;
  sent: number;
  drafts: number;
  archive: number;
  trash: number;
  starred: number;
}

export interface InternalMailMailboxEntry {
  id: string;
  recipientType: InternalMailRecipientType;
  archivedSourceUserId: string | null;
  archivedSourceUserName: string | null;
  archivedSourceUserEmail: string | null;
  archivedSourceAt: string | null;
  readAt: string | null;
  starredAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface InternalMailRecipientDetail {
  id: string;
  userId: string;
  recipientType: InternalMailRecipientType;
  deliverySourceType: InternalMailDeliverySourceType;
  deliverySourceId: string | null;
  archivedSourceUserId: string | null;
  archivedSourceUserName: string | null;
  archivedSourceUserEmail: string | null;
  archivedSourceAt: string | null;
  readAt: string | null;
  starredAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: InternalMailUserOption;
}

export interface InternalMailListRecipient {
  id: string;
  recipientType: InternalMailRecipientType;
  user: InternalMailUserOption;
}

export interface InternalMailListItem {
  id: string;
  threadId: string;
  subject: string;
  preview: string;
  sentAt: string | null;
  updatedAt: string;
  isDraft: boolean;
  sender: InternalMailUserOption;
  mailboxEntry: InternalMailMailboxEntry;
  recipientCount: number;
  recipients: InternalMailListRecipient[];
}

export interface InternalMailReference {
  id: string;
  threadId: string;
  subject: string;
  senderId: string;
  sentAt: string | null;
  isDraft: boolean;
  sender: InternalMailUserOption;
}

export interface InternalMailMessageDetail {
  id: string;
  threadId: string;
  subject: string;
  bodyMarkdown: string;
  draftToUserIds: string[];
  draftCcUserIds: string[];
  draftToGroupIds: string[];
  draftCcGroupIds: string[];
  sentAt: string | null;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  senderId: string;
  sender: InternalMailUserOption;
  replyToMessageId: string | null;
  forwardOfMessageId: string | null;
  replyToMessage: InternalMailReference | null;
  forwardOfMessage: InternalMailReference | null;
  recipients: InternalMailRecipientDetail[];
  currentUserMailboxEntry: InternalMailRecipientDetail | null;
  currentUserMailboxEntries: InternalMailRecipientDetail[];
}

export interface CreateInternalMailPayload {
  subject: string;
  bodyMarkdown: string;
  saveAsDraft?: boolean;
  draftId?: string;
  threadId?: string;
  replyToMessageId?: string;
  forwardOfMessageId?: string;
  toUserIds?: string[];
  ccUserIds?: string[];
  toGroupIds?: string[];
  ccGroupIds?: string[];
}

export interface UpdateInternalMailMailboxPayload {
  action: "STAR" | "UNSTAR" | "ARCHIVE" | "DELETE" | "RESTORE" | "PURGE";
}

export interface BulkUpdateInternalMailMailboxPayload {
  folder: "inbox" | "sent" | "drafts" | "archive";
  action: "DELETE";
  keyword?: string;
  archivedSource?: "archived" | "direct";
  read?: "read" | "unread";
  starred?: "true" | "false";
}
