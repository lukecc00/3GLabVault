import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

interface MailcowMailboxPayload {
  username: string;
  password: string;
  name: string;
  active: boolean;
  forcePasswordUpdate: boolean;
}

interface MailcowApiResponseItem {
  type?: string;
  msg?: unknown;
}

@Injectable()
export class MailcowService {
  isEnabled() {
    return (
      this.hasConfiguredValue(process.env.MAILCOW_API_BASE_URL, [
        'https://mail.example.com',
      ]) &&
      this.hasConfiguredValue(process.env.MAILCOW_API_KEY, [
        'replace-with-read-write-api-key',
      ])
    );
  }

  async createMailbox(payload: MailcowMailboxPayload) {
    await this.request('/api/v1/add/mailbox', {
      active: payload.active ? '1' : '0',
      domain: this.getMailDomain(),
      local_part: this.getLocalPart(payload.username),
      name: payload.name,
      password: payload.password,
      password2: payload.password,
      quota: this.getMailboxQuota(),
      force_pw_update: payload.forcePasswordUpdate ? '1' : '0',
      tls_enforce_in: '1',
      tls_enforce_out: '1',
    });
  }

  async updateMailbox(usernameOrEmail: string, attr: Record<string, string>) {
    await this.request('/api/v1/edit/mailbox', {
      items: [this.ensureEmailAddress(usernameOrEmail)],
      attr,
    });
  }

  async deleteMailbox(usernameOrEmail: string) {
    await this.request('/api/v1/delete/mailbox', [
      this.ensureEmailAddress(usernameOrEmail),
    ]);
  }

  ensureDomainMatches(email: string) {
    const mailDomain = this.getMailDomain();
    const [, domain] = email.split('@');

    if (domain !== mailDomain) {
      throw new InternalServerErrorException(
        `邮箱域名 ${domain} 与当前 MAIL_DOMAIN=${mailDomain} 不一致`,
      );
    }
  }

  private async request(path: string, body: unknown) {
    if (!this.isEnabled()) {
      return;
    }

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.getApiKey(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Mailcow API 请求失败，状态码 ${response.status}`,
      );
    }

    const data = (await response.json()) as
      | MailcowApiResponseItem
      | MailcowApiResponseItem[];
    const item = Array.isArray(data) ? data[0] : data;

    if (item?.type && item.type !== 'success') {
      throw new BadGatewayException(this.extractMessage(item.msg));
    }
  }

  private extractMessage(msg: unknown) {
    if (Array.isArray(msg)) {
      return msg.map((item) => String(item)).join(' ');
    }

    if (msg === undefined || msg === null) {
      return 'Mailcow 返回了未知错误';
    }

    if (
      typeof msg === 'string' ||
      typeof msg === 'number' ||
      typeof msg === 'boolean'
    ) {
      return String(msg);
    }

    return JSON.stringify(msg);
  }

  private getLocalPart(usernameOrEmail: string) {
    return this.ensureEmailAddress(usernameOrEmail).split('@')[0];
  }

  private ensureEmailAddress(usernameOrEmail: string) {
    if (usernameOrEmail.includes('@')) {
      return usernameOrEmail.toLowerCase();
    }

    return `${usernameOrEmail.toLowerCase()}@${this.getMailDomain()}`;
  }

  private getBaseUrl() {
    return (process.env.MAILCOW_API_BASE_URL ?? '').replace(/\/$/, '');
  }

  private getApiKey() {
    const apiKey = process.env.MAILCOW_API_KEY;

    if (!apiKey) {
      throw new InternalServerErrorException('缺少 MAILCOW_API_KEY 配置');
    }

    return apiKey;
  }

  private getMailDomain() {
    return process.env.MAIL_DOMAIN ?? '3glab';
  }

  private getMailboxQuota() {
    return process.env.MAILCOW_DEFAULT_MAILBOX_QUOTA ?? '1024';
  }

  private hasConfiguredValue(
    value: string | undefined,
    invalidPlaceholders: string[],
  ) {
    if (!value) {
      return false;
    }

    const normalized = value.trim();
    if (!normalized) {
      return false;
    }

    return !invalidPlaceholders.includes(normalized);
  }
}
