const SLACK_API = 'https://slack.com/api';

export interface SlackPostMessageOptions {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: unknown[];
}

export interface SlackPostMessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export interface SlackUpdateMessageOptions {
  channel: string;
  ts: string;
  text: string;
}

export interface SlackAuthTestResult {
  ok: boolean;
  user_id?: string;
  bot_id?: string;
  user?: string;
  team?: string;
  team_id?: string;
  error?: string;
}

export interface SlackUserInfo {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    real_name?: string;
    profile?: {
      display_name?: string;
      image_48?: string;
    };
  };
  error?: string;
}

export interface SlackReplyMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  subtype?: string;
  files?: Array<{
    id: string;
    name: string;
    mimetype: string;
    filetype: string;
    url_private: string;
    url_private_download?: string;
    size: number;
  }>;
}

export interface SlackFileUploadOptions {
  channel: string;
  threadTs?: string;
  filename: string;
  content: Buffer;
  title?: string;
}

export interface SlackConversationMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  subtype?: string;
}

export class SlackApi {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.botToken}`,
    };
  }

  async postMessage(options: SlackPostMessageOptions): Promise<SlackPostMessageResult> {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(options),
    });
    return res.json() as Promise<SlackPostMessageResult>;
  }

  async updateMessage(options: SlackUpdateMessageOptions): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API}/chat.update`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(options),
    });
    return res.json() as Promise<{ ok: boolean; error?: string }>;
  }

  async authTest(): Promise<SlackAuthTestResult> {
    const res = await fetch(`${SLACK_API}/auth.test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });
    return res.json() as Promise<SlackAuthTestResult>;
  }

  async usersInfo(userId: string): Promise<SlackUserInfo> {
    const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });
    return res.json() as Promise<SlackUserInfo>;
  }

  async addReaction(channel: string, timestamp: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API}/reactions.add`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ channel, timestamp, name }),
    });
    return res.json() as Promise<{ ok: boolean; error?: string }>;
  }

  async removeReaction(channel: string, timestamp: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API}/reactions.remove`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ channel, timestamp, name }),
    });
    return res.json() as Promise<{ ok: boolean; error?: string }>;
  }

  async conversationsReplies(
    channel: string,
    ts: string,
    limit = 20,
  ): Promise<{ ok: boolean; messages?: SlackReplyMessage[]; error?: string }> {
    const params = new URLSearchParams({ channel, ts, limit: String(limit) });
    const res = await fetch(`${SLACK_API}/conversations.replies?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });
    return res.json() as Promise<{ ok: boolean; messages?: SlackReplyMessage[]; error?: string }>;
  }


  async filesUploadV2(options: SlackFileUploadOptions): Promise<{ ok: boolean; error?: string }> {
    const getUrlRes = await fetch(`${SLACK_API}/files.getUploadURLExternal`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        filename: options.filename,
        length: options.content.length,
      }),
    });

    const urlData = (await getUrlRes.json()) as {
      ok: boolean;
      upload_url?: string;
      file_id?: string;
      error?: string;
    };

    if (!urlData.ok || !urlData.upload_url || !urlData.file_id) {
      console.error(`[SLACK API] getUploadURLExternal failed: ${urlData.error}`);
      return { ok: false, error: urlData.error || 'Failed to get upload URL' };
    }

    const uploadRes = await fetch(urlData.upload_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(options.content),
    });

    if (!uploadRes.ok) {
      return { ok: false, error: `Upload failed: ${uploadRes.status}` };
    }

    const channelId = options.channel;
    const completeRes = await fetch(`${SLACK_API}/files.completeUploadExternal`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        files: [{
          id: urlData.file_id,
          title: options.title || options.filename,
        }],
        channel_id: channelId,
        thread_ts: options.threadTs,
      }),
    });

    return completeRes.json() as Promise<{ ok: boolean; error?: string }>;
  }

  async chatUnfurl(
    channel: string,
    ts: string,
    unfurls: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API}/chat.unfurl`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ channel, ts, unfurls }),
    });
    return res.json() as Promise<{ ok: boolean; error?: string }>;
  }

  async conversationsHistory(
    channel: string,
    oldest?: string,
    limit = 100,
  ): Promise<{ ok: boolean; messages?: SlackConversationMessage[]; error?: string }> {
    const params = new URLSearchParams({ channel, limit: String(limit) });
    if (oldest) {
      params.set('oldest', oldest);
    }

    const res = await fetch(`${SLACK_API}/conversations.history?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });
    return res.json() as Promise<{ ok: boolean; messages?: SlackConversationMessage[]; error?: string }>;
  }
}
