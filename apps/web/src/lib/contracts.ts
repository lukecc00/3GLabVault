export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED";
export type GroupType = "DIRECTION" | "GRADE" | "FUNCTIONAL" | "SYSTEM";
export type MembershipRole = "MEMBER" | "MANAGER";
export type MailboxProvisioningStatus = "PENDING" | "PROVISIONED" | "FAILED";
export type InternalMailRecipientType = "SENDER" | "TO" | "CC";
export type InternalMailDeliverySourceType = "USER" | "GROUP";

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
  realName: string;
  studentId: string | null;
  avatarUrl: string | null;
  bio: string | null;
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

export interface BatchGenerateUsersPayload {
  groupIds: string[];
  users: Array<{
    realName: string;
    studentId?: string;
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
    studentId?: string;
    reason: string;
  }>;
}

export interface ReviewUserPayload {
  status: UserStatus;
  roleIds?: string[];
  groupIds?: string[];
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

export interface AddGroupMemberPayload {
  userId: string;
  membershipRole: MembershipRole;
}

export type SpaceVisibility = "PUBLIC" | "PRIVATE" | "GROUP_RESTRICTED";
export type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface KnowledgeSpaceSummary {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: SpaceVisibility;
  ownerGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  ownerGroup: GroupSummary["parent"];
  _count: {
    pages: number;
  };
}

export interface KnowledgePageSummary {
  id: string;
  spaceId: string;
  authorId: string | null;
  editorId: string | null;
  title: string;
  slug: string;
  summary: string | null;
  contentMd: string;
  contentRawJson: unknown;
  tags: string[];
  status: PageStatus;
  publishedAt: string | null;
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
}

export interface KnowledgeSpaceDetail extends KnowledgeSpaceSummary {
  pages: Array<{
    id: string;
    spaceId: string;
    authorId: string | null;
    editorId: string | null;
    title: string;
    slug: string;
    summary: string | null;
    contentMd: string;
    contentRawJson: unknown;
    tags: string[];
    status: PageStatus;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface CreateKnowledgeSpacePayload {
  code: string;
  slug: string;
  name: string;
  description?: string;
  visibility?: SpaceVisibility;
  ownerGroupId?: string;
}

export interface CreateKnowledgePagePayload {
  spaceId: string;
  title: string;
  slug: string;
  summary?: string;
  contentMd: string;
  tags?: string[];
  status?: PageStatus;
}

export interface UpdateKnowledgePagePayload {
  title?: string;
  slug?: string;
  summary?: string;
  contentMd?: string;
  contentRawJson?: unknown;
  tags?: string[];
  status?: PageStatus;
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
  action: "STAR" | "UNSTAR" | "ARCHIVE" | "DELETE" | "RESTORE";
}
