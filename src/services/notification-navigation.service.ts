
import { navigate } from '@/navigation/root-navigation';
import { ACTIONS } from '@/store/types';
import { GetRequest } from '@/utils/requests';

export type MessageNotificationType = 'dm' | 'group_dm' | 'channel';

export interface MessageNotificationPayload {
  notification_type: MessageNotificationType;
  channel_id: string;
  participant_id?: string;
  thread_id?: string;
}

export interface OpenChatFromNotificationDeps {
  dispatch: (action: any) => void;
  dms: any[] | null | undefined;
  userChannels: any[] | null | undefined;
  callback: boolean | undefined;
  channelCallback: boolean | undefined;
}

let pendingPayload: MessageNotificationPayload | null = null;

const MESSAGE_NOTIFICATION_TYPES = new Set<MessageNotificationType>([
  'dm',
  'group_dm',
  'channel',
]);

const parseJsonSafely = (value: unknown) => {
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export function resolveNotificationPayload(payload: any) {
  if (!payload) return null;

  const additionalData = payload?.additionalData;
  const customData = payload?.rawPayload?.custom?.a;
  const alertBody = parseJsonSafely(payload?.body);
  const apsBody = parseJsonSafely(payload?.rawPayload?.aps?.alert?.body);

  return {
    ...(apsBody && typeof apsBody === 'object' ? apsBody : {}),
    ...(alertBody && typeof alertBody === 'object' ? alertBody : {}),
    ...(customData && typeof customData === 'object' ? customData : {}),
    ...(additionalData && typeof additionalData === 'object'
      ? additionalData
      : {}),
    ...(typeof payload === 'object' ? payload : {}),
  };
}

export function parseMessageNotificationPayload(
  data: any,
): MessageNotificationPayload | null {
  if (!data || typeof data !== 'object') return null;

  const notificationType = data.notification_type;

  if (!MESSAGE_NOTIFICATION_TYPES.has(notificationType)) return null;

  const channelId = data.channel_id || data.channels_id;

  if (!channelId) return null;

  return {
    notification_type: notificationType,
    channel_id: String(channelId),
    participant_id: data.participant_id || data.sender_id || undefined,
    thread_id: data.thread_id ? String(data.thread_id) : undefined,
  };
}

export function queueMessageNotificationClick(
  payload: MessageNotificationPayload,
) {
  pendingPayload = payload;
}

export function clearPendingMessageNotification() {
  pendingPayload = null;
}

export function markThreadAsRead(
  dispatch: (action: any) => void,
  threadType: MessageNotificationType,
  channelId?: string,
) {
  if (!channelId) return;

  if (threadType === 'channel') {
    dispatch({
      type: ACTIONS.RESET_CHANNEL_THREAD_COUNT,
      payload: channelId,
    });
    return;
  }

  dispatch({
    type: ACTIONS.RESET_DM_THREAD_COUNT,
    payload: channelId,
  });
}

function channelIdsMatch(channel: any, channelId: string): boolean {
  return (
    String(channel?.channels_id ?? '') === channelId ||
    String(channel?.channel_id ?? '') === channelId
  );
}

/**
 * Finds a thread's parent message in the cached conversation preview.
 * If the parent is not cached, callers fall back to opening the main chat.
 */
function findThreadParent(
  previewThread: any,
  threadId?: string,
): any | null {
  if (!threadId || !Array.isArray(previewThread)) return null;

  return (
    previewThread.find(
      (message: any) => String(message?.thread_id ?? '') === threadId,
    ) ?? null
  );
}

async function resolveChannel(
  channelId: string,
  userChannels: any[] | null | undefined,
) {
  const cached = (userChannels || []).find((channel: any) =>
    channelIdsMatch(channel, channelId),
  );

  if (cached) return cached;

  const { data, error } = await GetRequest('/channels/' + channelId);

  if (error || !data?.data) return null;

  return data.data;
}

export async function openChatFromNotification(
  payload: MessageNotificationPayload,
  deps: OpenChatFromNotificationDeps,
): Promise<boolean> {
  const { dispatch, dms, userChannels, callback, channelCallback } = deps;

  if (payload.notification_type === 'dm') {
    const chat = (dms || []).find(
      (item: any) =>
        String(item.channel_id) === payload.channel_id &&
        item.channel_type === 'dm',
    );

    if (chat) {
      dispatch({
        type: ACTIONS.PARTICIPANT,
        payload: chat.participants,
      });

      dispatch({
        type: ACTIONS.DMS_CHAT,
        payload: { data: chat.preview_thread, page: 1 },
      });
    }

    const threadParent = findThreadParent(
      chat?.preview_thread,
      payload.thread_id,
    );

    if (threadParent && payload.thread_id) {
      dispatch({
        type: ACTIONS.SELECTED_MSG,
        payload: threadParent,
      });

      dispatch({
        type: ACTIONS.REPLY_CHAT,
        payload: {
          data: threadParent.preview_reply ?? [],
          page: 1,
        },
      });

      navigate('ChatStack', {
        screen: 'ChatThreadScreen',
        params: {
          channel_id: payload.channel_id,
          thread_id: payload.thread_id,
          chatType: 'dm',
        },
      });
    } else {
      navigate('ChatStack', {
        screen: 'ChatDetails',
        params: {
          channel_id: payload.channel_id,
          participant_id: payload.participant_id || chat?.participant_id,
          fromNotification: true,
        },
      });
    }

    markThreadAsRead(dispatch, 'dm', payload.channel_id);

    dispatch({
      type: ACTIONS.CALLBACK,
      payload: !callback,
    });

    return true;
  }

  if (payload.notification_type === 'group_dm') {
    const chat = (dms || []).find(
      (item: any) =>
        String(item.channel_id) === payload.channel_id &&
        item.channel_type === 'group_dm',
    );

    if (chat) {
      dispatch({
        type: ACTIONS.PARTICIPANT,
        payload: chat.participants,
      });

      dispatch({
        type: ACTIONS.DMS_CHAT,
        payload: { data: chat.preview_thread, page: 1 },
      });
    }

    const threadParent = findThreadParent(
      chat?.preview_thread,
      payload.thread_id,
    );

    if (threadParent && payload.thread_id) {
      dispatch({
        type: ACTIONS.SELECTED_MSG,
        payload: threadParent,
      });

      dispatch({
        type: ACTIONS.REPLY_CHAT,
        payload: {
          data: threadParent.preview_reply ?? [],
          page: 1,
        },
      });

      navigate('ChatStack', {
        screen: 'GroupChatThreadScreen',
        params: {
          channel_id: payload.channel_id,
          thread_id: payload.thread_id,
        },
      });
    } else {
      navigate('ChatStack', {
        screen: 'GroupChatDetails',
        params: {
          channel_id: payload.channel_id,
          fromNotification: true,
        },
      });
    }

    markThreadAsRead(dispatch, 'group_dm', payload.channel_id);

    dispatch({
      type: ACTIONS.CALLBACK,
      payload: !callback,
    });

    return true;
  }

  const channel = await resolveChannel(payload.channel_id, userChannels);

  if (channel) {
    dispatch({
      type: ACTIONS.CHANNEL,
      payload: channel,
    });

    dispatch({
      type: ACTIONS.CHANNELS_CHAT,
      payload: {
        data: channel.preview_thread || [],
        page: 1,
      },
    });
  } else {
    dispatch({
      type: ACTIONS.CHANNEL,
      payload: {
        channels_id: payload.channel_id,
        channel_id: payload.channel_id,
      },
    });

    dispatch({
      type: ACTIONS.CHANNELS_CHAT,
      payload: {
        data: [],
        page: 1,
      },
    });
  }

  const threadParent = findThreadParent(
    channel?.preview_thread,
    payload.thread_id,
  );

  if (threadParent && payload.thread_id) {
    dispatch({
      type: ACTIONS.SELECTED_MSG,
      payload: threadParent,
    });

    dispatch({
      type: ACTIONS.REPLY_CHAT,
      payload: {
        data: threadParent.preview_reply ?? [],
        page: 1,
      },
    });

    navigate('ChannelStack', {
      screen: 'ChannelThread',
      params: {
        channel_id: payload.channel_id,
        thread_id: payload.thread_id,
      },
    });
  } else {
    navigate('ChannelStack', {
      screen: 'ChannelChat',
      params: {
        channel_id: payload.channel_id,
        fromNotification: true,
      },
    });
  }

  markThreadAsRead(
    dispatch,
    'channel',
    channel?.channels_id || payload.channel_id,
  );

  dispatch({
    type: ACTIONS.CHANNEL_CALLBACK,
    payload: !channelCallback,
  });

  return true;
}

export async function handleMessageNotificationClick(
  rawNotification: any,
  deps: OpenChatFromNotificationDeps,
  options: { isReady: boolean },
): Promise<void> {
  const resolved = resolveNotificationPayload(rawNotification);
  const payload = parseMessageNotificationPayload(resolved);

  if (!payload) return;

  if (!options.isReady) {
    queueMessageNotificationClick(payload);
    return;
  }

  clearPendingMessageNotification();

  await openChatFromNotification(payload, deps);
}

export async function consumePendingMessageNotification(
  deps: OpenChatFromNotificationDeps,
  options: { isReady: boolean },
): Promise<void> {
  if (!options.isReady || !pendingPayload) return;

  const payload = pendingPayload;

  clearPendingMessageNotification();

  await openChatFromNotification(payload, deps);
}
