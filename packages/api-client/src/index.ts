export type Gender = 'boy' | 'girl';

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  phone: string;
  gender: Gender;
  status: 'active' | 'banned' | 'deleted';
  createdAt: string;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  expiresAt: string;
};

export type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  genderPolicy: 'everyone' | 'boys' | 'girls';
  maxUsers: number;
  tvEnabled: boolean;
  status: 'pending' | 'active' | 'hidden' | 'closed';
  favorite: boolean;
  viewerRole: 'owner' | 'moderator' | 'viewer';
  invited: boolean;
  owner: { username: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  onlineCount?: number;
};

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
  bio: string | null;
};

export type NearbyPerson = {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
  bio: string | null;
  distanceKmApprox: number;
  distanceLabel: string;
};

export type PrivatePeer = {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
};

export type PrivateConversation = {
  id: string;
  peer: PrivatePeer;
  lastText?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
};

export type PrivateMessageRequest = {
  id: string;
  peer: PrivatePeer;
  text: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  messageType?: 'text' | 'voice';
  type?: 'text' | 'voice';
  text?: string | null;
  textContent?: string | null;
  sender?: { id?: string; username: string; displayName: string; gender?: Gender };
  senderId?: string;
  createdAt: string;
  expiresAt: string;
  voice?: { mime: string | null; bytes: number | null; durationMs: number | null } | null;
  reactions?: { like: { count: number; reacted: boolean } };
};

export type WalletSummary = {
  balanceMilli: number;
  balanceLyd: string;
  currency: 'LYD';
};

export type WalletHistoryItem = {
  id?: string;
  kind: string;
  amountMilli: number;
  amountLyd?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type StoreItem = {
  id: string;
  code: string;
  itemType?: string;
  type?: string;
  name: string;
  description?: string | null;
  priceMilli: number;
  priceLyd?: string;
  recipientShareMilli?: number;
  consumable?: boolean;
  assetKey?: string | null;
  metadata?: Record<string, unknown>;
  owned?: boolean;
  equipped?: boolean;
};

export type TvChannel = {
  id: string;
  name: string;
  groupName: string | null;
  streamUrl: string;
  logoUrl: string | null;
  sortOrder?: number;
};

export type PrayerSchedule = {
  reference: { key: string; name: string; timezone: string };
  date: string;
  timezone: string;
  schedule: Record<'fajr'|'sunrise'|'dhuhr'|'asr'|'sunset'|'maghrib'|'isha', {
    instant: string;
    localTime: string;
  }>;
  settingsRevision: number;
  cached: boolean;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  soundKey: string | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  fetchImpl?: typeof fetch;
};

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return path;
  const query = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]));
  return `${path}?${query.toString()}`;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = trimSlash(options.baseUrl);
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private requestUrl(path:string){
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async blob(path:string):Promise<Blob>{
    const token=this.getAccessToken();
    const headers=new Headers();
    if(token)headers.set('Authorization',`Bearer ${token}`);
    let response:Response;
    try{
      response=await this.fetchImpl(this.requestUrl(path),{headers});
    }catch{
      throw new ApiError(0,'NETWORK_ERROR');
    }
    if(!response.ok){
      let code=`HTTP_${response.status}`;
      try{
        const payload=await response.json() as {error?:unknown};
        if(typeof payload.error==='string')code=payload.error;
      }catch{/* binary/non-json error */}
      throw new ApiError(response.status,code);
    }
    return response.blob();
  }

  async request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const token = this.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.requestUrl(path), {
        ...init,
        headers
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR');
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json() as Record<string, unknown>
      : null;

    if (!response.ok) {
      const code = typeof payload?.error === 'string' ? payload.error : `HTTP_${response.status}`;
      const retry = typeof payload?.retryAfterSeconds === 'number'
        ? payload.retryAfterSeconds
        : Number(response.headers.get('retry-after') ?? '') || undefined;
      throw new ApiError(response.status, code, retry);
    }

    return payload as T;
  }

  register(input: {
    username: string; displayName: string; phone: string; gender: Gender;
    password: string; deviceId: string; platform: string;
  }) {
    return this.request<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
  }

  login(input: { login: string; password: string; deviceId: string; platform: string }) {
    return this.request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
  }

  me() {
    return this.request<{ user: AuthUser }>('/auth/me');
  }

  logout() {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  rooms(params: {
    search?: string; genderPolicy?: Room['genderPolicy']; favoritesOnly?: boolean; sort?: 'alphabetical'|'newest';
  } = {}) {
    return this.request<{ rooms: Room[] }>(withQuery('/rooms', params));
  }

  room(roomId: string) {
    return this.request<{ room: Room }>(`/rooms/${encodeURIComponent(roomId)}`);
  }

  createRoom(input: {
    name: string; description?: string; visibility?: 'public'|'private';
    genderPolicy?: Room['genderPolicy']; maxUsers?: number;
  }) {
    return this.request<{ room: Room }>('/rooms', { method: 'POST', body: JSON.stringify(input) });
  }

  favoriteRoom(roomId: string, active: boolean) {
    return this.request<void>(`/rooms/${encodeURIComponent(roomId)}/favorite`, { method: active ? 'POST' : 'DELETE' });
  }

  joinCheck(roomId: string) {
    return this.request<{ allowed: true; roomId: string; maxUsers: number }>(
      `/rooms/${encodeURIComponent(roomId)}/join-check`,
      { method: 'POST' }
    );
  }

  roomMessages(roomId: string, params: { limit?: number; before?: string } = {}) {
    return this.request<{ messages: ChatMessage[] }>(
      withQuery(`/rooms/${encodeURIComponent(roomId)}/messages`, params)
    );
  }

  roomVoiceUrl(roomId: string, messageId: string) {
    return `${this.baseUrl}/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/voice`;
  }

  deleteRoomMessage(roomId: string, messageId: string) {
    return this.request<void>(
      `/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE' }
    );
  }

  profileMe() {
    return this.request<{ profile: Profile & { phone: string; nearbyEnabled: boolean; mutualSuggestionsEnabled: boolean } }>('/profile/me');
  }

  profile(username: string) {
    return this.request<{ profile: Profile }>(`/profiles/${encodeURIComponent(username)}`);
  }

  updateProfile(input: { displayName?: string; bio?: string|null; nearbyEnabled?: boolean; mutualSuggestionsEnabled?: boolean }) {
    return this.request<{ profile: Profile }>('/profile/me', { method: 'PATCH', body: JSON.stringify(input) });
  }

  friends() {
    return this.request<{ friends: Profile[] }>('/friends');
  }

  friendRequests() {
    return this.request<{ requests: unknown[] }>('/friends/requests');
  }

  createFriendRequest(username: string) {
    return this.request<{ request: unknown }>('/friends/requests', { method: 'POST', body: JSON.stringify({ username }) });
  }

  updateNearbyLocation(latitude: number, longitude: number, accuracyM?: number) {
    return this.request<{ ok: boolean; updatedAt: string }>('/nearby/location', {
      method: 'PUT',
      body: JSON.stringify({ latitude, longitude, accuracyM })
    });
  }

  nearby(gender?: 'boy'|'girl') {
    return this.request<{ nearby: NearbyPerson[] }>(withQuery('/nearby', { gender }));
  }

  privateConversations() {
    return this.request<{ conversations: PrivateConversation[] }>('/private/conversations');
  }

  privateRequests() {
    return this.request<{ requests: PrivateMessageRequest[] }>('/private/requests');
  }

  acceptPrivateRequest(conversationId: string) {
    return this.request<{ ok: true }>(
      `/private/requests/${encodeURIComponent(conversationId)}/accept`,
      { method: 'POST' }
    );
  }

  rejectPrivateRequest(conversationId: string) {
    return this.request<{ ok: true }>(
      `/private/requests/${encodeURIComponent(conversationId)}/reject`,
      { method: 'POST' }
    );
  }

  startPrivateMessage(username: string, text: string) {
    return this.request<{ conversation: PrivateConversation; message: ChatMessage }>('/private/messages', {
      method: 'POST',
      body: JSON.stringify({ username, text })
    });
  }

  privateMessages(conversationId: string, params: { limit?: number; before?: string } = {}) {
    return this.request<{ messages: ChatMessage[] }>(
      withQuery(`/private/conversations/${encodeURIComponent(conversationId)}/messages`, params)
    );
  }

  privateVoiceUrl(conversationId: string, messageId: string) {
    return `${this.baseUrl}/private/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice`;
  }

  wallet() {
    return this.request<WalletSummary>('/wallet');
  }

  walletHistory(limit = 50) {
    return this.request<{ history: WalletHistoryItem[] }>(withQuery('/wallet/history', { limit }));
  }

  topupInstructions() {
    return this.request<{ method: string; contactNumber: string; currency: string; manualReviewRequired: boolean }>('/wallet/topup-instructions');
  }

  createTopup(amountMilli: number, paymentReference?: string, note?: string) {
    return this.request<{ topup: unknown }>('/wallet/topups', {
      method: 'POST',
      body: JSON.stringify({ amountMilli, paymentReference, note })
    });
  }

  transfer(username: string, amountMilli: number, idempotencyKey: string) {
    return this.request<{ transaction: unknown; balanceMilli: number; balanceLyd: string; replayed: boolean }>('/wallet/transfers', {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify({ username, amountMilli })
    });
  }

  storeItems(itemType?: string) {
    return this.request<{ items: StoreItem[] }>(withQuery('/store/items', { itemType }));
  }

  inventory() {
    return this.request<{ items?: StoreItem[]; inventory?: StoreItem[] }>('/store/inventory');
  }

  equipment() {
    return this.request<{ equipment: unknown }>('/store/equipment');
  }

  purchase(code: string, idempotencyKey: string) {
    return this.request<{ item: StoreItem; balanceMilli: number; replayed: boolean }>('/store/purchases', {
      method: 'POST', idempotencyKey, body: JSON.stringify({ code })
    });
  }

  sendGift(recipientUsername: string, giftCode: string, idempotencyKey: string) {
    return this.request<{ item: StoreItem; recipient: Profile; balanceMilli: number; replayed: boolean }>('/gifts/send', {
      method: 'POST', idempotencyKey, body: JSON.stringify({ recipientUsername, giftCode })
    });
  }

  tvChannels(params: { sort?: 'manual'|'alphabetical'; search?: string; group?: string; limit?: number } = {}) {
    return this.request<{ channels: TvChannel[] }>(withQuery('/tv/channels', params));
  }

  roomTv(roomId: string) {
    return this.request<{ tv: unknown }>(`/rooms/${encodeURIComponent(roomId)}/tv`);
  }

  prayerSchedule(reference?: string, date?: string) {
    return this.request<{ prayer: PrayerSchedule }>(withQuery('/prayer/schedule', { reference, date }));
  }

  prayerPreferences() {
    return this.request<{ preferences: {
      referenceKey: string; prayerAlertsEnabled: boolean; prayerSoundEnabled: boolean; gentleRemindersEnabled: boolean;
    } }>('/prayer/preferences');
  }

  resolvePrayerReference(latitude: number, longitude: number) {
    return this.request<{ resolved: unknown }>('/prayer/reference/resolve', {
      method: 'POST', body: JSON.stringify({ latitude, longitude })
    });
  }

  notifications(limit = 50) {
    return this.request<{ notifications: AppNotification[] }>(withQuery('/notifications', { limit }));
  }

  markNotificationRead(id: string) {
    return this.request<{ notification: AppNotification }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  }

  markAllNotificationsRead() {
    return this.request<{ updated: number }>('/notifications/read-all', { method: 'POST' });
  }

  notificationPreferences() {
    return this.request<{ preferences: unknown }>('/notifications/preferences');
  }

  updateNotificationPreferences(patch: Record<string, boolean>) {
    return this.request<{ preferences: unknown }>('/notifications/preferences', {
      method: 'PATCH', body: JSON.stringify(patch)
    });
  }

  pushConfig() {
    return this.request<{
      webPushConfigured: boolean;
      androidFcmConfigured: boolean;
      webPushVapidPublicKey: string | null;
    }>('/notifications/push/config');
  }

  registerWebPush(installationId: string, subscription: PushSubscriptionJSON) {
    return this.request<{ subscription: unknown }>('/notifications/push/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ platform: 'web', installationId, subscription })
    });
  }

  registerAndroidPush(installationId: string, token: string) {
    return this.request<{ subscription: unknown }>('/notifications/push/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ platform: 'android', installationId, token })
    });
  }
}
