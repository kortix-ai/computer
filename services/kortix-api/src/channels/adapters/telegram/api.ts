const TELEGRAM_API = 'https://api.telegram.org';

export interface TelegramSendMessageOptions {
  chat_id: number | string;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_to_message_id?: number;
  message_thread_id?: number;
}

export interface TelegramSendMessageResult {
  ok: boolean;
  result?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
  description?: string;
}

export interface TelegramEditMessageOptions {
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
}

export class TelegramApi {
  private apiUrl: string;

  constructor(botToken: string) {
    this.apiUrl = `${TELEGRAM_API}/bot${botToken}`;
  }

  async sendMessage(options: TelegramSendMessageOptions): Promise<TelegramSendMessageResult> {
    const res = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return res.json() as Promise<TelegramSendMessageResult>;
  }

  async editMessage(options: TelegramEditMessageOptions): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return res.json();
  }

  async sendChatAction(chatId: number | string, action: string = 'typing'): Promise<void> {
    await fetch(`${this.apiUrl}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<{ ok: boolean; description?: string }> {
    const res = await fetch(`${this.apiUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'edited_message', 'channel_post'],
        drop_pending_updates: false,
      }),
    });
    return res.json() as Promise<{ ok: boolean; description?: string }>;
  }

  async deleteWebhook(): Promise<{ ok: boolean; description?: string }> {
    const res = await fetch(`${this.apiUrl}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    return res.json() as Promise<{ ok: boolean; description?: string }>;
  }

  async getMe(): Promise<{ ok: boolean; result?: { id: number; username: string; first_name: string } }> {
    const res = await fetch(`${this.apiUrl}/getMe`, {
      method: 'GET',
    });
    return res.json() as Promise<{ ok: boolean; result?: { id: number; username: string; first_name: string } }>;
  }
}
