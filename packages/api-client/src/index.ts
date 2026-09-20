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
  accessToken: string | null;
  expiresAt: string;
};

export type AuthDevice = {
  installationId:string;
  platform:string|null;
  firstSeenAt:string;
  lastSeenAt:string;
  activeSessions:number;
  current:boolean;
  latestSessionAt:string|null;
};

export type RecoveryRequestReceipt = {
  accepted:true;
  requestId:string;
  message:string;
};

export type AdminRecoveryRequest = {
  requestId:string;
  userId:string;
  username:string;
  displayName:string;
  createdAt:string;
  expiresAt:string;
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

export type RoomManagement = {
  room: Room;
  permissions: {
    owner:boolean;
    canEditRoom:boolean;
    canManageModerators:boolean;
    canModerate:boolean;
  };
  moderators:Array<{username:string;displayName:string;createdAt:string}>;
  bans:Array<{username:string;displayName:string;reason:string|null;expiresAt:string|null;createdAt:string}>;
  invites:Array<{username:string;displayName:string;expiresAt:string|null;createdAt:string}>;
};

export type TvAdminChannel = TvChannel & {
  sortOrder:number;
  status:'active'|'hidden';
  rightsConfirmed:boolean;
  rightsNote:string|null;
  createdAt:string;
  updatedAt:string;
};

export type TvImportBatch = {
  id:string;
  sourceType:'upload'|'url';
  sourceLabel:string|null;
  sourceHost:string|null;
  sourceFingerprint:string|null;
  rightsAttested:boolean;
  importedCount:number;
  skippedCount:number;
  createdAt:string;
};

export type FeatureSnapshot={
  tv:boolean;
  store:boolean;
  paid_features:boolean;
  telemetry:boolean;
  push:boolean;
};

export type TelemetryEvent={
  eventType:string;
  route:string;
  appVersion:string;
  platform:'web'|'android';
  context?:Record<string,string|number|boolean>;
};

export type TelemetryDashboardRow={
  error:string;
  frequency:number;
  version:string;
  platform:string;
  firstSeen:string;
  lastSeen:string;
};

export type UserCosmetics={
  frameCode:string|null;
  badgeCode:string|null;
  badgeName:string|null;
};

export type Profile = {
  id:string;
  username:string;
  displayName:string;
  gender:Gender;
  bio:string|null;
  cosmetics?:UserCosmetics;
  language?:'ar'|'en';
  profileVisibility?:'public'|'friends';
  nearbyConsentAt?:string|null;
};

export type FriendRequest = {
  id:string;
  direction:'incoming'|'outgoing';
  status:'pending';
  createdAt:string;
  user:{username:string;displayName:string};
};

export type ReportReason='spam'|'harassment'|'impersonation'|'inappropriate'|'other';

export type NearbyPerson = {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
  bio: string | null;
  distanceKmApprox: number;
  distanceLabel: string;
  cosmetics?:UserCosmetics;
};

export type PrivatePeer = {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
  cosmetics?:UserCosmetics;
};

export type PrivateConversation = {
  id: string;
  status?: 'pending' | 'active' | 'rejected';
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
  sender?: { id?: string; username: string; displayName: string; gender?: Gender; cosmetics?:UserCosmetics };
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
  type: 'frame'|'entry_sound'|'theme'|'sticker_pack'|'badge'|'gift'|'reaction';
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
  status?: 'draft'|'active'|'hidden';
  createdAt?: string;
  updatedAt?: string;
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

export type AndroidRelease = {
  id: string;
  channel: 'stable' | 'beta';
  versionName: string;
  versionCode: number;
  minSupportedVersionCode: number;
  fileName: string;
  fileBytes: number;
  sha256: string;
  notes: string | null;
  publishedAt: string;
  downloadPath: string;
};

export type AdminAndroidRelease = {
  id:string;
  channel:'stable'|'beta';
  versionName:string;
  versionCode:number;
  minSupportedVersionCode:number;
  fileName:string;
  fileBytes:number;
  sha256:string;
  notes:string|null;
  status:'draft'|'published'|'retired';
  publishedAt:string|null;
  createdAt:string;
  updatedAt:string;
};

export type AndroidReleaseCheck = {
  release: AndroidRelease | null;
  updateAvailable: boolean;
  required: boolean;
};

export type AdminMe = {
  user: { id: string; username: string; displayName: string };
  roles: Array<'super_admin'|'tv_admin'|'moderation_admin'|'finance_admin'|'release_admin'>;
  mfa: { enabled: boolean; enabledAt: string | null };
};

export type AdminOverview = {
  users: { active: number; banned: number; deleted: number };
  openReports: number;
  pendingTopups: number;
  activeRooms: number;
};

export type AdminUserSummary = {
  id: string; username: string; displayName: string; phone: string; gender: Gender;
  status: 'active'|'banned'|'deleted'; createdAt: string;
  moderationReason: string | null; moderatedAt: string | null;
};

export type AdminUserDetail = AdminUserSummary & {
  bio: string | null;
  nearbyEnabled: boolean;
  roles: string[];
  devices: Array<{
    installationId: string; platform: string | null; firstSeenAt: string;
    lastSeenAt: string; blockedAt: string | null;
  }>;
  lastLocation: {
    latitude: number; longitude: number; accuracyM: number | null; updatedAt: string;
  } | null;
};

export type AdminReport = {
  id: string; reason: string; details: string | null; status: 'open'|'reviewing'|'closed';
  reporter: { id: string; username: string };
  target: { id: string; username: string };
  reviewNote: string | null; createdAt: string; updatedAt: string;
};

export type AdminTopup = {
  id: string;
  user: { id: string; username: string; displayName: string };
  amountMilli: number; paymentReference: string | null; note: string | null; createdAt: string;
};

export type AdminAuditEntry = {
  id: string;
  actor: { id: string; username: string };
  action: string;
  target: { id: string; username: string | null } | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  categories: {
    privateMessages: boolean;
    messageRequests: boolean;
    friendRequests: boolean;
    friendAccepts: boolean;
    roomAlerts: boolean;
    walletEvents: boolean;
    adminAlerts: boolean;
    appUpdates: boolean;
  };
  sounds: {
    messages: boolean;
    interface: boolean;
    rooms: boolean;
    vibration: boolean;
    muteAll: boolean;
  };
  updatedAt: string;
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
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
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
        credentials: init.credentials ?? 'include',
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
    password: string; ownerClaimCode?: string; deviceId: string; platform: string; sessionMode?: 'cookie'|'bearer';
  }) {
    const {sessionMode,...body}=input;
    return this.request<AuthSession>('/auth/register', {
      method: 'POST',
      ...(sessionMode==='cookie' ? {headers:{'X-3AKSA-Session-Mode':'cookie'}} : {}),
      body: JSON.stringify(body)
    });
  }

  login(input: {
    login: string; password: string; deviceId: string; platform: string;
    sessionMode?: 'cookie'|'bearer';
  }) {
    const {sessionMode,...body}=input;
    return this.request<AuthSession>('/auth/login', {
      method: 'POST',
      ...(sessionMode==='cookie' ? {headers:{'X-3AKSA-Session-Mode':'cookie'}} : {}),
      body: JSON.stringify(body)
    });
  }

  me() {
    return this.request<{ user: AuthUser }>('/auth/me');
  }

  logout() {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  requestPasswordRecovery(login:string){
    return this.request<RecoveryRequestReceipt>('/auth/recovery/request',{
      method:'POST',body:JSON.stringify({login})
    });
  }

  confirmPasswordRecovery(input:{
    requestId:string;recoveryCode:string;newPassword:string;deviceId:string;platform:string;
    sessionMode?:'cookie'|'bearer';
  }){
    const {sessionMode,...body}=input;
    return this.request<AuthSession>('/auth/recovery/confirm',{
      method:'POST',
      ...(sessionMode==='cookie'?{headers:{'X-3AKSA-Session-Mode':'cookie'}}:{}),
      body:JSON.stringify(body)
    });
  }

  devices(){
    return this.request<{devices:AuthDevice[]}>('/auth/devices');
  }

  revokeDeviceSessions(installationId:string){
    return this.request<{revoked:number}>(`/auth/devices/${encodeURIComponent(installationId)}/sessions`,{
      method:'DELETE'
    });
  }

  revokeOtherSessions(){
    return this.request<{revoked:number}>('/auth/sessions/revoke-others',{method:'POST'});
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

  roomManagement(roomId:string){
    return this.request<{management:RoomManagement}>(`/rooms/${encodeURIComponent(roomId)}/management`);
  }

  updateRoom(roomId:string,patch:Partial<Pick<Room,'name'|'description'|'visibility'|'genderPolicy'|'maxUsers'|'status'>>){
    return this.request<{room:Room}>(`/rooms/${encodeURIComponent(roomId)}`,{
      method:'PATCH',body:JSON.stringify(patch)
    });
  }

  addRoomModerator(roomId:string,username:string){
    return this.request<{ok:true}>(`/rooms/${encodeURIComponent(roomId)}/moderators`,{
      method:'POST',body:JSON.stringify({username})
    });
  }

  removeRoomModerator(roomId:string,username:string){
    return this.request<void>(`/rooms/${encodeURIComponent(roomId)}/moderators/${encodeURIComponent(username)}`,{method:'DELETE'});
  }

  banRoomUser(roomId:string,input:{username:string;reason?:string;expiresAt?:string|null}){
    return this.request<{ok:true}>(`/rooms/${encodeURIComponent(roomId)}/bans`,{
      method:'POST',body:JSON.stringify(input)
    });
  }

  unbanRoomUser(roomId:string,username:string){
    return this.request<void>(`/rooms/${encodeURIComponent(roomId)}/bans/${encodeURIComponent(username)}`,{method:'DELETE'});
  }

  inviteRoomUser(roomId:string,input:{username:string;expiresAt?:string|null}){
    return this.request<{ok:true}>(`/rooms/${encodeURIComponent(roomId)}/invites`,{
      method:'POST',body:JSON.stringify(input)
    });
  }

  revokeRoomInvite(roomId:string,username:string){
    return this.request<void>(`/rooms/${encodeURIComponent(roomId)}/invites/${encodeURIComponent(username)}`,{method:'DELETE'});
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

  profileMe(){
    return this.request<{profile:Profile&{
      phone:string;nearbyEnabled:boolean;mutualSuggestionsEnabled:boolean;
      language:'ar'|'en';profileVisibility:'public'|'friends';nearbyConsentAt:string|null;
    }}>('/profile/me');
  }

  profile(username: string) {
    return this.request<{ profile: Profile }>(`/profiles/${encodeURIComponent(username)}`);
  }

  updateProfile(input:{
    displayName?:string;bio?:string|null;nearbyEnabled?:boolean;mutualSuggestionsEnabled?:boolean;
    language?:'ar'|'en';profileVisibility?:'public'|'friends';nearbyConsent?:boolean;
  }){
    return this.request<{profile:Profile&{
      nearbyEnabled:boolean;mutualSuggestionsEnabled:boolean;language:'ar'|'en';
      profileVisibility:'public'|'friends';nearbyConsentAt:string|null;
    }}>('/profile/me',{method:'PATCH',body:JSON.stringify(input)});
  }

  deleteAccount(password:string){
    return this.request<{deleted:true}>('/account/delete',{
      method:'POST',body:JSON.stringify({password,confirmation:'DELETE'})
    });
  }

  featureFlags(){
    return this.request<{flags:FeatureSnapshot}>('/app/feature-flags');
  }

  telemetryEvents(events:TelemetryEvent[]){
    return this.request<{accepted:number}>('/telemetry/events',{
      method:'POST',body:JSON.stringify({events})
    });
  }

  adminFeatureFlags(mfaCode:string){
    return this.request<{flags:Array<{key:keyof FeatureSnapshot;enabled:boolean;metadata:Record<string,unknown>;updatedAt:string}>}>('/admin/feature-flags',{
      headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminUpdateFeatureFlag(mfaCode:string,key:keyof FeatureSnapshot,enabled:boolean){
    return this.request<{flag:{key:keyof FeatureSnapshot;enabled:boolean;metadata:Record<string,unknown>;updatedAt:string}}>(
      `/admin/feature-flags/${encodeURIComponent(key)}`,{
        method:'PATCH',headers:{'X-Admin-Mfa-Code':mfaCode},body:JSON.stringify({enabled})
      }
    );
  }

  adminTelemetry(mfaCode:string,limit=50){
    return this.request<{errors:TelemetryDashboardRow[]}>(withQuery('/admin/telemetry',{limit}),{
      headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  friends() {
    return this.request<{ friends: Profile[] }>('/friends');
  }

  friendRequests() {
    return this.request<{ requests: FriendRequest[] }>('/friends/requests');
  }

  createFriendRequest(username: string) {
    return this.request<{ request: {id:string} }>('/friends/requests', { method: 'POST', body: JSON.stringify({ username }) });
  }

  acceptFriendRequest(requestId:string){
    return this.request<{ok:true}>(`/friends/requests/${encodeURIComponent(requestId)}/accept`,{method:'POST'});
  }

  rejectFriendRequest(requestId:string){
    return this.request<{ok:true}>(`/friends/requests/${encodeURIComponent(requestId)}/reject`,{method:'POST'});
  }

  cancelFriendRequest(requestId:string){
    return this.request<void>(`/friends/requests/${encodeURIComponent(requestId)}`,{method:'DELETE'});
  }

  removeFriend(username:string){
    return this.request<void>(`/friends/${encodeURIComponent(username)}`,{method:'DELETE'});
  }

  blockedUsers(){
    return this.request<{blocked:Profile[]}>('/blocks');
  }

  blockUser(username:string){
    return this.request<{ok:true}>('/blocks',{method:'POST',body:JSON.stringify({username})});
  }

  unblockUser(username:string){
    return this.request<void>(`/blocks/${encodeURIComponent(username)}`,{method:'DELETE'});
  }

  reportUser(username:string,reason:ReportReason,details?:string){
    return this.request<{report:{id:string;createdAt:string}}>('/reports',{
      method:'POST',body:JSON.stringify({username,reason,details})
    });
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

  topups() {
    return this.request<{ topups: Array<{
      id: string; amountMilli: number; amountLyd: string; currency: 'LYD';
      status: 'pending'|'approved'|'rejected'|'cancelled';
      paymentReference: string|null; note: string|null; reviewedAt: string|null;
      ledgerTransactionId: string|null; createdAt: string; updatedAt: string;
    }> }>('/wallet/topups');
  }

  transfer(username: string, amountMilli: number, idempotencyKey: string) {
    return this.request<{ transaction: unknown; balanceMilli: number; balanceLyd: string; replayed: boolean }>('/wallet/transfers', {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify({ username, amountMilli })
    });
  }

  storeAssetUrl(code:string){
    return this.requestUrl(`/store/assets/${encodeURIComponent(code)}`);
  }

  storeItems(type?: StoreItem['type']) {
    return this.request<{ items: StoreItem[] }>(withQuery('/store/items', { type }));
  }

  inventory() {
    return this.request<{ items: Array<StoreItem & { acquiredAt: string }> }>('/store/inventory');
  }

  equipment() {
    return this.request<{ equipment: Array<{ slot: 'frame'|'entry_sound'|'theme'|'badge'; item: StoreItem; equippedAt: string }> }>('/store/equipment');
  }

  equip(code: string) {
    return this.request<{ equipment: { slot: string; item: StoreItem; equippedAt: string } }>('/store/equipment', {
      method: 'PUT',
      body: JSON.stringify({ code })
    });
  }

  purchase(code: string, idempotencyKey: string) {
    return this.request<{ item: StoreItem; balanceMilli: number; replayed: boolean }>('/store/purchases', {
      method: 'POST', idempotencyKey, body: JSON.stringify({ code })
    });
  }

  sendGift(
    recipientUsername:string,giftCode:string,idempotencyKey:string,
    context?:{type:'profile'|'room'|'room_message'|'private_message';id?:string}
  ){
    return this.request<{ item: StoreItem; recipient: Profile; balanceMilli: number; replayed: boolean }>('/gifts/send', {
      method:'POST',idempotencyKey,
      body:JSON.stringify({
        recipientUsername,giftCode,
        ...(context?{contextType:context.type,contextId:context.id}:{})
      })
    });
  }

  tvChannels(params: { sort?: 'manual'|'alphabetical'; search?: string; group?: string; limit?: number } = {}) {
    return this.request<{ channels: TvChannel[] }>(withQuery('/tv/channels', params));
  }

  adminTvChannels(){
    return this.request<{channels:TvAdminChannel[]}>('/tv/admin/channels');
  }

  createAdminTvChannel(input:{
    name:string;groupName?:string|null;streamUrl:string;logoUrl?:string|null;sortOrder?:number;
    status?:'active'|'hidden';rightsAttested:boolean;rightsNote?:string|null;
  }){
    return this.request<{channel:TvAdminChannel}>('/tv/admin/channels',{method:'POST',body:JSON.stringify(input)});
  }

  updateAdminTvChannel(channelId:string,patch:Partial<{
    name:string;groupName:string|null;streamUrl:string;logoUrl:string|null;sortOrder:number;
    status:'active'|'hidden';rightsAttested:boolean;rightsNote:string|null;
  }>){
    return this.request<{channel:TvAdminChannel}>(`/tv/admin/channels/${encodeURIComponent(channelId)}`,{
      method:'PATCH',body:JSON.stringify(patch)
    });
  }

  deleteAdminTvChannel(channelId:string){
    return this.request<{deleted:unknown}>(`/tv/admin/channels/${encodeURIComponent(channelId)}`,{method:'DELETE'});
  }

  deleteAllAdminTvChannels(){
    return this.request<{deletedCount:number}>('/tv/admin/channels',{
      method:'DELETE',headers:{'X-Confirm-Delete-All':'DELETE_ALL_TV_CHANNELS'}
    });
  }

  reorderAdminTvChannels(channelIds:string[]){
    return this.request<{reordered:number}>('/tv/admin/channels/order',{
      method:'PUT',body:JSON.stringify({channelIds})
    });
  }

  importAdminM3u(input:{
    content?:string;sourceUrl?:string;sourceLabel?:string|null;rightsAttested:boolean;rightsNote?:string|null;
  }){
    return this.request<{import:{batchId:string;imported:number;skipped:number;total:number}}>('/tv/admin/imports/m3u',{
      method:'POST',body:JSON.stringify(input)
    });
  }

  adminTvImports(){
    return this.request<{imports:TvImportBatch[]}>('/tv/admin/imports');
  }

  roomTv(roomId: string) {
    return this.request<{ tv: unknown }>(`/rooms/${encodeURIComponent(roomId)}/tv`);
  }

  prayerSchedule(reference?: string, date?: string) {
    return this.request<{ prayer: PrayerSchedule }>(withQuery('/prayer/schedule', { reference, date }));
  }

  prayerReferences() {
    return this.request<{ references: Array<{ key: string; name: string; timezone: string }> }>('/prayer/references');
  }

  prayerPreferences() {
    return this.request<{ preferences: {
      referenceKey: string; prayerAlertsEnabled: boolean; prayerSoundEnabled: boolean; gentleRemindersEnabled: boolean;
    } }>('/prayer/preferences');
  }

  updatePrayerPreferences(patch: {
    referenceKey?: string;
    prayerAlertsEnabled?: boolean;
    prayerSoundEnabled?: boolean;
    gentleRemindersEnabled?: boolean;
  }) {
    return this.request<{ preferences: {
      referenceKey: string; prayerAlertsEnabled: boolean; prayerSoundEnabled: boolean; gentleRemindersEnabled: boolean;
    } }>('/prayer/preferences', { method: 'PATCH', body: JSON.stringify(patch) });
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
    return this.request<{ preferences: NotificationPreferences }>('/notifications/preferences');
  }

  updateNotificationPreferences(patch: Record<string, boolean>) {
    return this.request<{ preferences: NotificationPreferences }>('/notifications/preferences', {
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

  androidRelease(currentVersionCode: number, channel: 'stable'|'beta' = 'stable') {
    return this.request<AndroidReleaseCheck>(
      withQuery('/app/releases/android/latest', { currentVersionCode, channel })
    );
  }

  adminAndroidReleases(mfaCode:string){
    return this.request<{releases:AdminAndroidRelease[]}>('/admin/releases/android',{
      headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminUploadAndroidRelease(mfaCode:string,input:{
    base64:string;fileName:string;versionName:string;versionCode:number;minSupportedVersionCode:number;
    channel:'stable'|'beta';notes?:string|null;
  }){
    return this.request<{release:AdminAndroidRelease}>('/admin/releases/android',{
      method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode},body:JSON.stringify(input)
    });
  }

  adminUpdateAndroidRelease(mfaCode:string,releaseId:string,patch:{
    minSupportedVersionCode?:number;notes?:string|null;
  }){
    return this.request<{release:AdminAndroidRelease}>(`/admin/releases/android/${encodeURIComponent(releaseId)}`,{
      method:'PATCH',headers:{'X-Admin-Mfa-Code':mfaCode},body:JSON.stringify(patch)
    });
  }

  adminPublishAndroidRelease(mfaCode:string,releaseId:string){
    return this.request<{release:AdminAndroidRelease}>(`/admin/releases/android/${encodeURIComponent(releaseId)}/publish`,{
      method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminRetireAndroidRelease(mfaCode:string,releaseId:string){
    return this.request<{release:AdminAndroidRelease}>(`/admin/releases/android/${encodeURIComponent(releaseId)}/retire`,{
      method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminMe() {
    return this.request<AdminMe>('/admin/me');
  }

  adminMfaSetup(password: string) {
    return this.request<{ secret: string; otpauth: string; expiresAt: string }>('/admin/security/mfa/setup', {
      method: 'POST', body: JSON.stringify({ password })
    });
  }

  adminMfaConfirm(code: string) {
    return this.request<{ enabled: true }>('/admin/security/mfa/confirm', {
      method: 'POST', body: JSON.stringify({ code })
    });
  }

  adminOverview(mfaCode: string) {
    return this.request<{ overview: AdminOverview }>('/admin/overview', {
      headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminRecoveryRequests(mfaCode:string,limit=100){
    return this.request<{requests:AdminRecoveryRequest[]}>(withQuery('/admin/recovery',{limit}),{
      headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminApproveRecovery(mfaCode:string,requestId:string){
    return this.request<{recovery:{
      requestId:string;userId:string;username:string;recoveryCode:string;expiresAt:string;
    }}>(`/admin/recovery/${encodeURIComponent(requestId)}/approve`,{
      method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminRejectRecovery(mfaCode:string,requestId:string){
    return this.request<{recovery:{requestId:string;userId:string;rejected:true}}>(
      `/admin/recovery/${encodeURIComponent(requestId)}/reject`,{
        method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode}
      }
    );
  }

  adminUsers(mfaCode: string, params: { search?: string; status?: AdminUserSummary['status']; limit?: number } = {}) {
    return this.request<{ users: AdminUserSummary[] }>(withQuery('/admin/users', params), {
      headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminUser(mfaCode: string, userId: string) {
    return this.request<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(userId)}`, {
      headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminBanUser(mfaCode: string, userId: string, reason: string) {
    return this.request<{ user: { id: string; status: 'banned' } }>(`/admin/users/${encodeURIComponent(userId)}/ban`, {
      method: 'POST', headers: { 'X-Admin-Mfa-Code': mfaCode }, body: JSON.stringify({ reason })
    });
  }

  adminUnbanUser(mfaCode: string, userId: string, reason: string) {
    return this.request<{ user: { id: string; status: 'active' } }>(`/admin/users/${encodeURIComponent(userId)}/unban`, {
      method: 'POST', headers: { 'X-Admin-Mfa-Code': mfaCode }, body: JSON.stringify({ reason })
    });
  }

  adminDeleteUser(mfaCode: string, userId: string, reason: string) {
    return this.request<{ user: { id: string; status: 'deleted' } }>(`/admin/users/${encodeURIComponent(userId)}/delete`, {
      method: 'POST', headers: { 'X-Admin-Mfa-Code': mfaCode }, body: JSON.stringify({ reason })
    });
  }

  adminResetPassword(mfaCode: string, userId: string, newPassword: string, reason: string) {
    return this.request<{ result: { id: string; reset: true } }>(`/admin/users/${encodeURIComponent(userId)}/password-reset`, {
      method: 'POST', headers: { 'X-Admin-Mfa-Code': mfaCode }, body: JSON.stringify({ newPassword, reason })
    });
  }

  adminReports(mfaCode: string, status?: AdminReport['status']) {
    return this.request<{ reports: AdminReport[] }>(withQuery('/admin/reports', { status }), {
      headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminReviewReport(mfaCode: string, reportId: string, status: 'reviewing'|'closed', note?: string) {
    return this.request<{ report: { id: string; status: string } }>(`/admin/reports/${encodeURIComponent(reportId)}`, {
      method: 'PATCH', headers: { 'X-Admin-Mfa-Code': mfaCode }, body: JSON.stringify({ status, note })
    });
  }

  adminStoreItems(mfaCode:string){
    return this.request<{items:StoreItem[]}>('/admin/store/items',{
      headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminCreateStoreItem(mfaCode:string,input:{
    code:string;type:StoreItem['type'];name:string;description?:string|null;
    priceMilli:number;recipientShareMilli?:number;status?:'draft'|'active'|'hidden';
    metadata?:Record<string,unknown>;
  }){
    return this.request<{item:StoreItem}>('/admin/store/items',{
      method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode},body:JSON.stringify(input)
    });
  }

  adminUpdateStoreItem(mfaCode:string,itemId:string,patch:Partial<{
    code:string;type:StoreItem['type'];name:string;description:string|null;
    priceMilli:number;recipientShareMilli:number;status:'draft'|'active'|'hidden';
    metadata:Record<string,unknown>;
  }>){
    return this.request<{item:StoreItem}>(`/admin/store/items/${encodeURIComponent(itemId)}`,{
      method:'PATCH',headers:{'X-Admin-Mfa-Code':mfaCode},body:JSON.stringify(patch)
    });
  }

  adminRetireStoreItem(mfaCode:string,itemId:string){
    return this.request<void>(`/admin/store/items/${encodeURIComponent(itemId)}`,{
      method:'DELETE',headers:{'X-Admin-Mfa-Code':mfaCode}
    });
  }

  adminUploadStoreAsset(mfaCode:string,itemId:string,base64:string){
    return this.request<{asset:{mime:string;bytes:number}}>(`/admin/store/items/${encodeURIComponent(itemId)}/asset`,{
      method:'POST',headers:{'X-Admin-Mfa-Code':mfaCode},body:JSON.stringify({base64})
    });
  }

  adminTopups(mfaCode: string) {
    return this.request<{ topups: AdminTopup[] }>('/admin/topups', {
      headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminApproveTopup(mfaCode: string, requestId: string) {
    return this.request<unknown>(`/admin/topups/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST', headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminRejectTopup(mfaCode: string, requestId: string) {
    return this.request<unknown>(`/admin/topups/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST', headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminAudit(mfaCode: string, limit = 100) {
    return this.request<{ audit: AdminAuditEntry[] }>(withQuery('/admin/audit', { limit }), {
      headers: { 'X-Admin-Mfa-Code': mfaCode }
    });
  }

  adminBreakGlassPrivate(mfaCode: string, conversationId: string, reason: string, limit = 100) {
    return this.request<{
      conversation: { id: string; status: string; participants: Array<{ id: string; username: string }> };
      messages: Array<{
        id: string; type: 'text'|'voice'; text: string | null;
        voice: { mime: string | null; bytes: number | null; durationMs: number | null } | null;
        sender: { id: string; username: string; displayName: string };
        createdAt: string; expiresAt: string;
      }>;
    }>(`/admin/break-glass/private/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: { 'X-Admin-Mfa-Code': mfaCode },
      body: JSON.stringify({ reason, limit })
    });
  }
}
