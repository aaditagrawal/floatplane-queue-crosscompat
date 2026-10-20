// Floatplane API Service Layer
// Based on unofficial API documentation: https://github.com/jamamp/FloatplaneAPI

const API_BASE = "https://www.floatplane.com/api";

// Types
export interface User {
  id: string;
  username: string;
  profileImage: {
    width: number;
    height: number;
    path: string;
    childImages?: { width: number; height: number; path: string }[];
  };
  email?: string;
  displayName?: string;
}

export interface Creator {
  id: string;
  owner: string;
  title: string;
  urlname: string;
  description: string;
  about: string;
  category: { id: string; title: string };
  cover: ImageModel | null;
  icon: ImageModel | null;
  subscriberCountDisplay: string;
  incomeDisplay: boolean;
  defaultChannel?: string;
  channels: Channel[];
  discordServers?: DiscordServer[];
  socialLinks?: Record<string, string>;
}

export interface Channel {
  id: string;
  creator: string;
  title: string;
  urlname: string;
  about: string;
  order?: number;
  cover?: ImageModel | null;
  icon?: ImageModel | null;
}

export interface DiscordServer {
  id: string;
  guildName: string;
  guildIcon: string;
  inviteLink: string;
  inviteMode: string;
}

export interface ImageModel {
  width: number;
  height: number;
  path: string;
  childImages?: { width: number; height: number; path: string }[];
}

export interface Subscription {
  startDate: string;
  endDate: string;
  paymentID: number;
  interval: string;
  paymentCancelled: boolean;
  plan: SubscriptionPlan;
  creator: string;
}

export interface SubscriptionPlan {
  id: string;
  title: string;
  description: string;
  price: string;
  priceYearly: string | null;
  currency: string;
  logo: ImageModel | null;
  interval: string;
  featured: boolean;
  allowGrandfatheredAccess: boolean;
  discordServers: DiscordServer[];
  discordRoles: DiscordRole[];
}

export interface DiscordRole {
  server: string;
  roleName: string;
}

export interface BlogPost {
  id: string;
  guid: string;
  title: string;
  text: string;
  type: string;
  channel: Channel;
  tags: string[];
  attachmentOrder: string[];
  metadata: PostMetadata;
  releaseDate: string;
  likes: number;
  dislikes: number;
  score: number;
  comments: number;
  creator: Creator | string;
  wasReleasedSilently: boolean;
  isAccessible: boolean;
  videoAttachments?: VideoAttachment[];
  audioAttachments?: AudioAttachment[];
  pictureAttachments?: PictureAttachment[];
  galleryAttachments?: GalleryAttachment[];
  thumbnail?: ImageModel;
}

export interface PostMetadata {
  hasVideo: boolean;
  videoCount: number;
  videoDuration: number;
  hasAudio: boolean;
  audioCount: number;
  audioDuration: number;
  hasPicture: boolean;
  pictureCount: number;
  hasGallery: boolean;
  galleryCount: number;
  isFeatured: boolean;
}

export interface VideoAttachment {
  id: string;
  guid: string;
  title: string;
  type: string;
  description: string;
  releaseDate: string | null;
  duration: number;
  creator: string;
  likes: number;
  dislikes: number;
  score: number;
  isProcessing: boolean;
  primaryBlogPost: string;
  thumbnail: ImageModel;
  isAccessible: boolean;
}

export interface AudioAttachment {
  id: string;
  guid: string;
  title: string;
  type: string;
  description: string;
  duration: number;
  creator: string;
  likes: number;
  dislikes: number;
  score: number;
  isProcessing: boolean;
  primaryBlogPost: string;
  waveform: ImageModel | null;
  isAccessible: boolean;
}

export interface PictureAttachment {
  id: string;
  guid: string;
  title: string;
  type: string;
  description: string;
  likes: number;
  dislikes: number;
  score: number;
  isProcessing: boolean;
  creator: string;
  primaryBlogPost: string;
  thumbnail: ImageModel;
  isAccessible: boolean;
}

export interface GalleryAttachment {
  id: string;
  guid: string;
  title: string;
  type: string;
  description: string;
  likes: number;
  dislikes: number;
  score: number;
  isProcessing: boolean;
  creator: string;
  primaryBlogPost: string;
  isAccessible: boolean;
}

export interface VideoContent {
  id: string;
  guid: string;
  title: string;
  type: string;
  description: string;
  releaseDate: string | null;
  duration: number;
  creator: string;
  likes: number;
  dislikes: number;
  score: number;
  isProcessing: boolean;
  primaryBlogPost: string;
  thumbnail: ImageModel;
  isAccessible: boolean;
  blogPosts: string[];
  levels: QualityLevel[];
  captions?: CaptionData[];
}

export interface QualityLevel {
  name: string;
  width: number;
  height: number;
  label: string;
  order: number;
}

export interface CaptionData {
  url: string;
  locale: string;
  label?: string;
}

export interface DeliveryInfo {
  cdn: string;
  strategy: string;
  resource: DeliveryResource;
}

export interface DeliveryResource {
  uri: string;
  data: {
    qualityLevels?: QualityLevelInfo[];
    qualityLevelParams?: Record<string, string>;
    token?: string;
  };
}

export interface QualityLevelInfo {
  name: string;
  width: number;
  height: number;
  label: string;
  order: number;
}

export interface DeliveryInfoV3 {
  groups: DeliveryGroup[];
}

export interface DeliveryGroup {
  origins: DeliveryOrigin[];
  variants: DeliveryVariant[];
}

export interface DeliveryOrigin {
  url: string;
  queryUrl?: string;
  datacenter?: { latitude: number; longitude: number };
}

export interface DeliveryVariant {
  name: string;
  label: string;
  url: string;
  mimeType?: string;
  order?: number;
  hidden?: boolean;
  enabled?: boolean;
  meta?: {
    video?: {
      codec: string;
      width: number;
      height: number;
      fps?: number;
      bitrate?: { average?: number };
    };
    audio?: { codec: string; bitrate?: { average?: number } };
  };
}

export interface Comment {
  id: string;
  blogPost: string;
  user: CommentUser;
  contentReference?: string;
  contentReferenceType?: string;
  text: string;
  replying?: string;
  postDate: string;
  editDate: string | null;
  likes: number;
  dislikes: number;
  score: number;
  interactionCounts: { like: number; dislike: number };
  totalReplies: number;
  replies: Comment[];
  userInteraction?: string[];
}

export interface CommentUser {
  id: string;
  username: string;
  profileImage: ImageModel;
}

export interface Progress {
  id: string;
  progress: number;
}

// API Functions
async function apiResponse(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response;
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await apiResponse(endpoint, options);
  return response.json();
}

async function apiFetchText(endpoint: string, options: RequestInit = {}): Promise<string> {
  const response = await apiResponse(endpoint, options);
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : response.text();
}

// User Endpoints
export async function getSelf(): Promise<User> {
  return apiFetch<User>("/v3/user/self");
}

export async function getUserSubscriptions(): Promise<Subscription[]> {
  return apiFetch<Subscription[]>("/v3/user/subscriptions");
}

// Creator Endpoints
export async function getCreatorInfo(creatorId: string): Promise<Creator> {
  return apiFetch<Creator>(`/v3/creator/info?id=${encodeURIComponent(creatorId)}`);
}

export async function getCreatorByName(urlname: string): Promise<Creator[]> {
  return apiFetch<Creator[]>(`/v3/creator/named?creatorURL[]=${encodeURIComponent(urlname)}`);
}

export async function getCreatorsList(search?: string): Promise<Creator[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch<Creator[]>(`/v3/creator/list${params}`);
}

export async function getCreatorChannels(creatorIds: string[]): Promise<Channel[]> {
  const params = creatorIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join("&");
  return apiFetch<Channel[]>(`/v3/creator/channels/list?${params}`);
}

// Content Endpoints
export interface GetCreatorContentOptions {
  id: string;
  channel?: string;
  limit?: number;
  fetchAfter?: string;
  search?: string;
  tags?: string[];
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasPicture?: boolean;
  hasText?: boolean;
  sort?: "newest" | "oldest" | "popular";
  fromDuration?: number;
  toDuration?: number;
  fromDate?: string;
  toDate?: string;
}

export async function getCreatorContent(options: GetCreatorContentOptions): Promise<BlogPost[]> {
  const params = new URLSearchParams();
  params.set("id", options.id);
  if (options.channel) params.set("channel", options.channel);
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.fetchAfter) params.set("fetchAfter", options.fetchAfter);
  if (options.search) params.set("search", options.search);
  if (options.tags) options.tags.forEach((tag) => params.append("tags[]", tag));
  if (options.hasVideo !== undefined) params.set("hasVideo", options.hasVideo.toString());
  if (options.hasAudio !== undefined) params.set("hasAudio", options.hasAudio.toString());
  if (options.hasPicture !== undefined) params.set("hasPicture", options.hasPicture.toString());
  if (options.hasText !== undefined) params.set("hasText", options.hasText.toString());
  if (options.sort) params.set("sort", options.sort);
  if (options.fromDuration) params.set("fromDuration", options.fromDuration.toString());
  if (options.toDuration) params.set("toDuration", options.toDuration.toString());
  if (options.fromDate) params.set("fromDate", options.fromDate);
  if (options.toDate) params.set("toDate", options.toDate);

  return apiFetch<BlogPost[]>(`/v3/content/creator?${params.toString()}`);
}

export async function getMultiCreatorContent(
  ids: string[],
  limit?: number,
  fetchAfter?: string[],
): Promise<{
  blogPosts: BlogPost[];
  lastElements: { creatorId: string; blogPostId: string; moreFetchable: boolean }[];
}> {
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("ids[]", id));
  if (limit) params.set("limit", limit.toString());
  if (fetchAfter) fetchAfter.forEach((fa) => params.append("fetchAfter[]", fa));

  return apiFetch(`/v3/content/creator/list?${params.toString()}`);
}

export async function getBlogPost(id: string): Promise<BlogPost> {
  return apiFetch<BlogPost>(`/v3/content/post?id=${encodeURIComponent(id)}`);
}

export async function getRelatedContent(id: string): Promise<BlogPost[]> {
  return apiFetch<BlogPost[]>(`/v3/content/related?id=${encodeURIComponent(id)}`);
}

export async function getContentTags(creatorIds: string[]): Promise<Record<string, number>> {
  const params = creatorIds.map((id) => `creatorIds[]=${encodeURIComponent(id)}`).join("&");
  return apiFetch<Record<string, number>>(`/v3/content/tags?${params}`);
}

// Video Content
export async function getVideoContent(id: string): Promise<VideoContent> {
  return apiFetch<VideoContent>(`/v3/content/video?id=${encodeURIComponent(id)}`);
}

// CDN/Delivery
export async function getDeliveryInfoV2(
  type: "vod" | "aod" | "live" | "download",
  guid: string,
  creator?: string,
): Promise<DeliveryInfo> {
  const params = new URLSearchParams({ type, guid });
  if (creator) params.set("creator", creator);
  return apiFetch<DeliveryInfo>(`/v2/cdn/delivery?${params.toString()}`);
}

export async function getDeliveryInfoV3(
  scenario: "onDemand" | "download" | "live",
  entityId: string,
  outputKind?: string,
): Promise<DeliveryInfoV3> {
  const params = new URLSearchParams({ scenario, entityId });
  if (outputKind) params.set("outputKind", outputKind);
  return apiFetch<DeliveryInfoV3>(`/v3/delivery/info?${params.toString()}`);
}

// Progress Tracking
export async function updateProgress(
  id: string,
  contentType: "video" | "audio",
  progress: number,
): Promise<string> {
  return apiFetchText("/v3/content/progress", {
    method: "POST",
    body: JSON.stringify({ id, contentType, progress }),
  });
}

export async function getProgress(
  ids: string[],
  contentType: "video" | "audio",
): Promise<Progress[]> {
  return apiFetch<Progress[]>("/v3/content/get/progress", {
    method: "POST",
    body: JSON.stringify({ ids, contentType }),
  });
}

// Interactions
export async function likeContent(contentType: string, id: string): Promise<string> {
  return apiFetchText("/v3/content/like", {
    method: "POST",
    body: JSON.stringify({ contentType, id }),
  });
}

export async function dislikeContent(contentType: string, id: string): Promise<string> {
  return apiFetchText("/v3/content/dislike", {
    method: "POST",
    body: JSON.stringify({ contentType, id }),
  });
}

// Comments
export async function getComments(
  blogPost: string,
  limit?: number,
  fetchAfter?: string,
): Promise<Comment[]> {
  const params = new URLSearchParams({ blogPost });
  if (limit) params.set("limit", limit.toString());
  if (fetchAfter) params.set("fetchAfter", fetchAfter);
  return apiFetch<Comment[]>(`/v3/comment?${params.toString()}`);
}

export async function getCommentReplies(
  comment: string,
  blogPost: string,
  limit?: number,
  rid?: string,
): Promise<Comment[]> {
  const params = new URLSearchParams({ comment, blogPost });
  if (limit) params.set("limit", limit.toString());
  if (rid) params.set("rid", rid);
  return apiFetch<Comment[]>(`/v3/comment/replies?${params.toString()}`);
}

export async function postComment(
  blogPost: string,
  text: string,
  replying?: string,
): Promise<Comment> {
  return apiFetch<Comment>("/v3/comment", {
    method: "POST",
    body: JSON.stringify({ blogPost, text, replying }),
  });
}

export async function likeComment(comment: string, blogPost: string): Promise<string> {
  return apiFetchText("/v3/comment/like", {
    method: "POST",
    body: JSON.stringify({ comment, blogPost }),
  });
}

export async function dislikeComment(comment: string, blogPost: string): Promise<string> {
  return apiFetchText("/v3/comment/dislike", {
    method: "POST",
    body: JSON.stringify({ comment, blogPost }),
  });
}

// Helper Functions
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getImageUrl(image: ImageModel | null | undefined, preferredWidth?: number): string {
  if (!image) return "";
  if (preferredWidth && image.childImages?.length) {
    const sorted = [...image.childImages].sort(
      (a, b) => Math.abs(a.width - preferredWidth) - Math.abs(b.width - preferredWidth),
    );
    return sorted[0]?.path ?? image.path;
  }
  return image.path;
}

export function getOptimalThumbnail(image: ImageModel | null | undefined): string {
  return getImageUrl(image, 480);
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears}y ago`;
  if (diffMonths > 0) return `${diffMonths}mo ago`;
  if (diffWeeks > 0) return `${diffWeeks}w ago`;
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "Just now";
}
