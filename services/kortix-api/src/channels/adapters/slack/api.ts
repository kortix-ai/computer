const SLACK_API = 'https://slack.com/api';

export interface SlackPostMessageOptions {
  channel: string;
  text: string;
  thread_ts?: string;
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

export class SlackApi {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  async postMessage(options: SlackPostMessageOptions): Promise<SlackPostMessageResult> {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(options),
    });
    return res.json() as Promise<SlackPostMessageResult>;
  }

  async updateMessage(options: SlackUpdateMessageOptions): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API}/chat.update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify({ channel, timestamp, name }),
    });
    return res.json() as Promise<{ ok: boolean; error?: string }>;
  }

  async removeReaction(channel: string, timestamp: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API}/reactions.remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
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
}

export interface SlackReplyMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  subtype?: string;
}
