'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface UiI18nMessages {
  confirm: string;
  cancel: string;
  searchPlaceholder: string;
  emptyOptions: string;
  noMatches: (query: string) => string;
  notifications: string;
  dismiss: string;
  close: string;
  remove: string;
  uploadImage: string;
  uploaded: string;
  replacingProgress: (progress: number) => string;
  replace: string;
  uploadingProgress: (progress: number) => string;
  uploadFailed: string;
  addImage: string;
  viewVideo: string;
  viewImage: string;
  video: string;
  failed: string;
  closeEsc: string;
  inputOrUploadPlaceholder: string;
  urlOrTextPlaceholder: string;
  uploadFile: string;
  loading: string;
}

export const UI_MESSAGES_EN: UiI18nMessages = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  searchPlaceholder: 'Search…',
  emptyOptions: 'No options available',
  noMatches: (query) => `No matches for “${query}”`,
  notifications: 'Notifications',
  dismiss: 'Dismiss',
  close: 'Close',
  remove: 'Remove',
  uploadImage: 'Upload image',
  uploaded: 'Uploaded',
  replacingProgress: (progress) => `Replacing ${progress}%`,
  replace: 'Replace',
  uploadingProgress: (progress) => `Uploading ${progress}%`,
  uploadFailed: 'Upload failed. Please try again.',
  addImage: 'Add image',
  viewVideo: 'View video',
  viewImage: 'View image',
  video: 'Video',
  failed: 'Failed',
  closeEsc: 'Close (Esc)',
  inputOrUploadPlaceholder: 'Enter text, paste a link, or upload a file',
  urlOrTextPlaceholder: 'Paste a link or enter text',
  uploadFile: 'Upload file',
  loading: 'Loading…',
};

export const UI_MESSAGES_ZH: UiI18nMessages = {
  confirm: '确认',
  cancel: '取消',
  searchPlaceholder: '搜索…',
  emptyOptions: '暂无可选项',
  noMatches: (query) => `没有匹配“${query}”的结果`,
  notifications: '通知',
  dismiss: '关闭通知',
  close: '关闭',
  remove: '移除',
  uploadImage: '上传图片',
  uploaded: '已上传',
  replacingProgress: (progress) => `替换中 ${progress}%`,
  replace: '替换',
  uploadingProgress: (progress) => `上传中 ${progress}%`,
  uploadFailed: '上传失败，请重试。',
  addImage: '添加图片',
  viewVideo: '查看视频',
  viewImage: '查看大图',
  video: '视频',
  failed: '失败',
  closeEsc: '关闭（Esc）',
  inputOrUploadPlaceholder: '输入文本、粘贴链接或上传文件',
  urlOrTextPlaceholder: '粘贴链接或输入文本',
  uploadFile: '上传文件',
  loading: '加载中…',
};

export function uiMessagesForLocale(locale: string): UiI18nMessages {
  return locale === 'zh' ? UI_MESSAGES_ZH : UI_MESSAGES_EN;
}

const UiI18nContext = createContext<UiI18nMessages>(UI_MESSAGES_EN);

export function UiI18nProvider({
  messages,
  children,
}: {
  messages: UiI18nMessages;
  children: ReactNode;
}) {
  return <UiI18nContext.Provider value={messages}>{children}</UiI18nContext.Provider>;
}

export function useUiI18n(): UiI18nMessages {
  return useContext(UiI18nContext);
}
