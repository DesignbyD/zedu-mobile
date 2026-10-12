import { Chat, Group, Participant } from '@/types/chats';
import { ACTIONS, Action } from './types';
import { OrgMembers } from '@/types/organisation';
import { Channel, ChannelChat } from '@/types/channel';
import { Agent } from '@/types/agents';
import { BuzzChat, BuzzParticipant } from '@/types/buzz';
import { AuthFlow } from '@/types/auth';
import { ThreadListItem } from '@/types/thread';
import { enrichForwardedMessageIfNeeded } from '@/utils/forward-message';
import {
  mergeParticipantsPreservingOrder,
  hasParticipantMembershipChanged,
} from '@/utils/group-participants';

export interface AppState {
  // auth
  token: string | null;
  orgId: string | null;
  user: any;
  success: string | null;
  error: string | null;
  callback: boolean;
  authFlow: AuthFlow | null;
  userTyping: { id: string | number; username: string; at: number }[];
  chatSubscription: any | null;
  channelSubscription: any | null;
  replySubscription: any | null;

  // organisation
  orgData: any;
  org: any[];
  orgMembers: OrgMembers[];
  orgCallback: boolean;

  // Dms
  dms: Chat[];
  dmsChat: any[];
  singleDmsChat: any[];
  dmLoading: boolean;
  participant: Participant[];
  singleParticipant: Participant[];
  receiver: object | null;
  media: any[];
  uploading: boolean;
  groupDetails: Group | null;
  groupCallback: boolean;
  selectedMsg: any | null;

  // channels
  userChannels: Channel[];
  allChannels: Channel[];
  channelLoading: boolean;
  channelsChat: ChannelChat[];
  replyChat: ChannelChat[];
  channelDetails: Channel | null;
  channel: Channel | null;
  channelCallback: boolean;
  replyCallback: boolean;

  // agents
  agents: Agent[];
  agent: Agent | null;
  agentsChat: any[];
  agentCallback: boolean;

  // buzz
  buzzParticipants: BuzzParticipant[];
  buzzChats: BuzzChat[];
  buzzData: any | null;
  hasJoined: boolean;
  floatingEmojis: any[];
  buzzIsMuted: boolean;
  buzzShowVideo: boolean;
  buzzIsScreenSharing: boolean;
  buzzJoinLoading: boolean;
  isCallMinimized: boolean;
  minimizedFrom: 'OngoingDirectCall' | 'CallScreen' | 'ChannelCall' | null;

  // settings
  statusCallback: boolean;
  billings: any[];

  // mentions
  mentionsList: ThreadListItem[];
  unseenThreadCount: number;
  loadThreadCallback: boolean;
  mentionUser: boolean;
}

const reducers = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case ACTIONS.USER:
      return { ...state, user: action.payload };
    case ACTIONS.TOKEN:
      return { ...state, token: action.payload };
    case ACTIONS.ORG_ID:
      return { ...state, orgId: action.payload };
    case ACTIONS.SUCCESS:
      return { ...state, success: action.payload };
    case ACTIONS.ERROR:
      return { ...state, error: action.payload };
    case ACTIONS.CALLBACK:
      return { ...state, callback: action.payload };
    case ACTIONS.ORG_DATA:
      return { ...state, orgData: action.payload };
    case ACTIONS.UPLOADING:
      return { ...state, uploading: action.payload };
    case ACTIONS.ORG_MEMBERS:
      return {
        ...state,
        orgMembers:
          action.payload.page === 1
            ? action.payload.data || []
            : [...(state.orgMembers || []), ...(action.payload.data || [])],
      };
    case ACTIONS.DM_LOADING:
      return { ...state, dmLoading: action.payload };
    case ACTIONS.PARTICIPANT: {
      const payload = action.payload;
      const current = state.participant;

      if (
        !Array.isArray(payload) ||
        !Array.isArray(current) ||
        !current.length
      ) {
        return { ...state, participant: payload };
      }

      const isSameGroup = current.some(c =>
        payload.some(p => String(p.user_id) === String(c.user_id)),
      );

      if (!isSameGroup) {
        return { ...state, participant: payload };
      }

      return {
        ...state,
        participant: mergeParticipantsPreservingOrder(current, payload),
      };
    }
    case ACTIONS.SINGLE_PARTICIPANT:
      return { ...state, singleParticipant: action.payload };
    case ACTIONS.RECEIVER:
      return { ...state, receiver: action.payload };
    case ACTIONS.MEDIA:
      return { ...state, media: action.payload };
    case ACTIONS.ORG:
      return { ...state, org: action.payload };
    case ACTIONS.ORG_CALLBACK:
      return { ...state, orgCallback: action.payload };
    case ACTIONS.AUTH_FLOW:
      return { ...state, authFlow: action.payload };
    case ACTIONS.CHAT_SUBSCRIPTION:
      return { ...state, chatSubscription: action.payload };
    case ACTIONS.CHANNEL_SUBSCRIPTION:
      return { ...state, channelSubscription: action.payload };
    case ACTIONS.REPLY_SUBSCRIPTION:
      return { ...state, replySubscription: action.payload };
    case ACTIONS.USER_TYPING: {
      const { userId, username, typing } = action.payload || {};
      const currentId = String(state.user?.user_id || state.user?.id || '');
      if (!userId || String(userId) === currentId) return state;

      const list = state.userTyping || [];
      if (typing) {
        const exists = list.some(
          (typer: any) => String(typer.id) === String(userId),
        );
        if (exists) {
          return {
            ...state,
            userTyping: list.map((typer: any) =>
              String(typer.id) === String(userId)
                ? {
                    ...typer,
                    username: username || typer.username || 'Someone',
                    at: Date.now(),
                  }
                : typer,
            ),
          };
        }
        return {
          ...state,
          userTyping: [
            ...list,
            { id: userId, username: username || 'Someone', at: Date.now() },
          ],
        };
      }

      return {
        ...state,
        userTyping: list.filter(
          (typer: any) => String(typer.id) !== String(userId),
        ),
      };
    }
    case ACTIONS.CLEAR_TYPING:
      return { ...state, userTyping: [] };

    // -----------------  DMS SECTION --------------------------------------
    case ACTIONS.DMS:
      return { ...state, dms: action.payload };

    case ACTIONS.DMS_CHAT:
      if (action.payload.newMessage) {
        const newMessage = action.payload.newMessage;

        // 1. If we receive a REAL message (from Centrifugo)
        if (!newMessage.isOptimistic) {
          // Filter out the optimistic placeholder AND any existing duplicate thread_id
          const cleanList = state.dmsChat.filter(
            msg => !msg.isOptimistic && msg.thread_id !== newMessage.thread_id,
          );

          return {
            ...state,
            dmsChat: [newMessage, ...cleanList],
          };
        }

        // 2. If it's the client's optimistic message, just add it
        return {
          ...state,
          dmsChat: [newMessage, ...state.dmsChat],
        };
      }

      // Pagination logic with double-check filter
      return {
        ...state,
        dmsChat:
          action.payload.page === 1
            ? action.payload.data || []
            : [
                ...state.dmsChat,
                ...(action.payload.data || []).filter(
                  (newItem: any) =>
                    !state.dmsChat.some(
                      (oldItem: any) => oldItem.thread_id === newItem.thread_id,
                    ),
                ),
              ],
      };

    case ACTIONS.EDIT_DM_CHAT:
      return {
        ...state,
        dmsChat: state.dmsChat.map(msg =>
          msg.thread_id === action.payload.threadId
            ? { ...msg, ...action.payload.updatedMessage }
            : msg,
        ),
      };

    case ACTIONS.UPDATE_DM_REACTIONS:
      return {
        ...state,
        dmsChat: state.dmsChat.map(message =>
          message.thread_id === action.payload.threadId
            ? { ...message, reactions: action.payload.reactions }
            : message,
        ),
      };

    case ACTIONS.RESET_DM_THREAD_COUNT:
      return {
        ...state,
        dms: state.dms.map(chat =>
          String(chat.channel_id ?? '') === String(action.payload) &&
          chat.thread_count > 0
            ? { ...chat, thread_count: 0 }
            : chat,
        ),
      };

    case ACTIONS.UPDATE_DM_COUNT:
      return {
        ...state,
        dms: state.dms.map(dm =>
          dm.channel_id === action.payload.channel_id
            ? { ...dm, thread_count: action.payload.thread_count }
            : dm,
        ),
      };

    case ACTIONS.UPDATE_DM_AND_MOVE_TO_TOP: {
      const updateData = action.payload;
      const currentDms = [...state.dms];
      let nextParticipant = state.participant;
      let nextGroupCallback = state.groupCallback;

      // Find the existing DM index
      const dmIndex = currentDms.findIndex(
        dm => dm.channel_id === updateData.channel_id,
      );

      if (dmIndex !== -1) {
        const existingDm = currentDms[dmIndex];

        // Remove from current position
        currentDms.splice(dmIndex, 1);

        const updatedDm = {
          ...existingDm,
          ...updateData,
          thread_count: updateData.thread_count ?? existingDm.thread_count,
          preview_message:
            updateData.preview_message ?? existingDm.preview_message,
          ...(Array.isArray(updateData.participants) && {
            participants: updateData.participants,
          }),
        };

        // Add to the top
        currentDms.unshift(updatedDm);
      } else if (updateData?.channel_id) {
        currentDms.unshift(updateData);
      }

      if (
        Array.isArray(updateData.participants) &&
        updateData.channel_type === 'group_dm'
      ) {
        const isSameGroup =
          state.participant.length === 0 ||
          state.participant.some(current =>
            updateData.participants.some(
              (updated: any) =>
                String(updated.user_id) === String(current.user_id),
            ),
          );

        if (
          isSameGroup &&
          hasParticipantMembershipChanged(
            state.participant,
            updateData.participants,
          )
        ) {
          nextParticipant = mergeParticipantsPreservingOrder(
            state.participant,
            updateData.participants,
          );
          nextGroupCallback = !state.groupCallback;
        }
      }

      return {
        ...state,
        dms: currentDms,
        participant: nextParticipant,
        groupCallback: nextGroupCallback,
      };
    }

    case ACTIONS.UPDATE_MESSAGE_THREAD: {
      const { threadId, reply, updates } = action.payload;

      const updatedDmsChat = state.dmsChat.map((msg: any) => {
        if (msg.thread_id === threadId) {
          const existingReplies = msg.messages || [];

          const userExists = existingReplies.some(
            (r: any) => r.user_id === reply.user_id,
          );

          return {
            ...msg,
            last_reply: reply?.created_at,
            messages: userExists
              ? existingReplies
              : [...existingReplies, reply],
            message_count: updates?.thread_count,
          };
        }
        return msg;
      });

      return {
        ...state,
        dmsChat: updatedDmsChat,
      };
    }

    case ACTIONS.DELETE_DM_MESSAGE:
      return {
        ...state,
        dmsChat: state.dmsChat.filter(
          (msg: any) => msg.thread_id !== action.payload.threadId,
        ),
      };

    case ACTIONS.SINGLE_DMS_CHAT:
      if (action.payload.newMessage) {
        const newMessage = action.payload.newMessage;

        if (!newMessage.isOptimistic) {
          const cleanList = state.singleDmsChat.filter(
            msg => !msg.isOptimistic && msg.thread_id !== newMessage.thread_id,
          );

          return {
            ...state,
            singleDmsChat: [newMessage, ...cleanList],
          };
        }

        return {
          ...state,
          singleDmsChat: [newMessage, ...state.singleDmsChat],
        };
      }

      return {
        ...state,
        singleDmsChat:
          action.payload.page === 1
            ? action.payload.data || []
            : [
                ...state.singleDmsChat,
                ...(action.payload.data || []).filter(
                  (newItem: any) =>
                    !state.singleDmsChat.some(
                      (oldItem: any) => oldItem.thread_id === newItem.thread_id,
                    ),
                ),
              ],
      };

    case ACTIONS.EDIT_SINGLE_DM_CHAT:
      return {
        ...state,
        singleDmsChat: state.singleDmsChat.map(msg =>
          msg.thread_id === action.payload.threadId
            ? { ...msg, ...action.payload.updatedMessage }
            : msg,
        ),
      };

    case ACTIONS.GROUP_DETAILS:
      return { ...state, groupDetails: action.payload };

    case ACTIONS.GROUP_CALLBACK:
      return { ...state, groupCallback: action.payload };

    case ACTIONS.SELECTED_MSG:
      return { ...state, selectedMsg: action.payload };

    case ACTIONS.MENTION_USER:
      return { ...state, mentionUser: action.payload };

    // -----------CHANNELS SECTION------------------------------------------
    case ACTIONS.USER_CHANNELS:
      return { ...state, userChannels: action.payload };

    case ACTIONS.ALL_CHANNELS:
      return { ...state, allChannels: action.payload };

    case ACTIONS.CHANNEL_LOADING:
      return { ...state, channelLoading: action.payload };

    case ACTIONS.CHANNELS_CHAT:
      if (action.payload.newMessage) {
        const newMessage = enrichForwardedMessageIfNeeded(
          action.payload.newMessage,
        );

        // 1. If we receive a REAL message (from Centrifugo)
        if (!newMessage.isOptimistic) {
          // Filter out the optimistic placeholder AND any existing duplicate thread_id
          const cleanList = state.channelsChat.filter(
            msg => !msg.isOptimistic && msg.thread_id !== newMessage.thread_id,
          );

          return {
            ...state,
            channelsChat: [newMessage, ...cleanList],
          };
        }

        // 2. If it's the client's optimistic message, just add it
        return {
          ...state,
          channelsChat: [newMessage, ...state.channelsChat],
        };
      }

      // Pagination logic with double-check filter
      return {
        ...state,
        channelsChat:
          action.payload.page === 1
            ? (action.payload.data || []).map(enrichForwardedMessageIfNeeded)
            : [
                ...state.channelsChat,
                ...(action.payload.data || [])
                  .map(enrichForwardedMessageIfNeeded)
                  .filter(
                    (newItem: any) =>
                      !state.channelsChat.some(
                        (oldItem: any) =>
                          oldItem.thread_id === newItem.thread_id,
                      ),
                  ),
              ],
      };

    case ACTIONS.EDIT_CHANNELS_CHAT:
      return {
        ...state,
        channelsChat: state.channelsChat.map(msg =>
          msg.thread_id === action.payload.threadId
            ? { ...msg, ...action.payload.updatedMessage }
            : msg,
        ),
      };

    case ACTIONS.CHANNEL_DETAILS:
      return { ...state, channelDetails: action.payload };

    case ACTIONS.CHANNEL:
      return { ...state, channel: action.payload };

    case ACTIONS.UPDATE_CHANNEL_COUNT: {
      const { channels_id, thread_count, channel } = action.payload;
      const updateData = channel ?? {};
      const currentChannels = [...state.userChannels];

      const channelIndex = currentChannels.findIndex(
        item => item.channels_id === channels_id,
      );

      if (channelIndex !== -1) {
        const existingChannel = currentChannels[channelIndex];
        currentChannels.splice(channelIndex, 1);

        const updatedChannel = {
          ...existingChannel,
          ...updateData,
          channels_id,
          thread_count: thread_count ?? existingChannel.thread_count,
          preview_message:
            updateData.preview_message ?? existingChannel.preview_message,
        };

        currentChannels.unshift(updatedChannel);

        return {
          ...state,
          userChannels: currentChannels,
        };
      }

      if (channel) {
        return {
          ...state,
          userChannels: [
            { ...channel, channels_id, thread_count } as Channel,
            ...state.userChannels,
          ],
        };
      }

      return state;
    }

    case ACTIONS.UPDATE_CHANNEL_MESSAGE_THREAD: {
      const { threadId, reply, updates } = action.payload;

      const updatedChannelsChat = state.channelsChat.map((msg: any) => {
        if (msg.thread_id === threadId) {
          const countOnlyUpdate =
            !reply?.user_id && updates?.thread_count !== undefined;

          if (countOnlyUpdate) {
            return {
              ...msg,
              message_count: updates.thread_count,
            };
          }

          const existingReplies = msg.messages || [];

          const userExists = existingReplies.some(
            (r: any) => r.user_id === reply.user_id,
          );

          return {
            ...msg,
            last_reply: reply?.created_at,
            messages: userExists
              ? existingReplies
              : [...existingReplies, reply],
            message_count: updates?.thread_count,
          };
        }
        return msg;
      });

      return {
        ...state,
        channelsChat: updatedChannelsChat,
      };
    }

    case ACTIONS.UPDATE_CHANNEL_REACTIONS: {
      const { threadId, reactions } = action.payload;
      const selectedMsg =
        state.selectedMsg?.thread_id === threadId
          ? { ...state.selectedMsg, reactions }
          : state.selectedMsg;

      return {
        ...state,
        selectedMsg,
        channelsChat: state.channelsChat.map(message =>
          message.thread_id === threadId ? { ...message, reactions } : message,
        ),
      };
    }

    case ACTIONS.RESET_CHANNEL_THREAD_COUNT:
      return {
        ...state,
        dms: state.dms.map(chat =>
          String(chat.channel_id ?? '') === String(action.payload) &&
          chat.thread_count > 0
            ? { ...chat, thread_count: 0 }
            : chat,
        ),
        userChannels: state.userChannels.map(channel =>
          String(channel.channels_id ?? '') === String(action.payload) &&
          (channel.thread_count > 0 || channel.mention_count > 0)
            ? { ...channel, thread_count: 0, mention_count: 0 }
            : channel,
        ),
      };

    case ACTIONS.DELETE_CHANNEL_MESSAGE:
      return {
        ...state,
        channelsChat: state.channelsChat.filter(
          (msg: any) => msg.thread_id !== action.payload.threadId,
        ),
      };

    case ACTIONS.CHANNEL_CALLBACK:
      return { ...state, channelCallback: action.payload };

    // ---------------REPLIES SECTION --------------------------

    case ACTIONS.REPLY_CHAT:
      if (action.payload.removedMessageId) {
        const removedMessageId = action.payload.removedMessageId;
        return {
          ...state,
          replyChat: state.replyChat.filter((msg: any) => {
            const messageId = msg?.id ?? msg?.message_id;
            return messageId !== removedMessageId;
          }),
        };
      }

      if (action.payload.newMessage) {
        const newMessage = action.payload.newMessage;

        if (newMessage.isOptimistic) {
          return {
            ...state,
            replyChat: [newMessage, ...state.replyChat],
          };
        }

        const incomingId = newMessage.id ?? newMessage.message_id;
        const replyChat = state.replyChat.filter((msg: any) => {
          const msgId = msg?.id ?? msg?.message_id;
          if (incomingId && msgId && String(msgId) === String(incomingId)) {
            return false;
          }
          if (msg.isOptimistic) {
            const sameAuthor =
              msg.user_id &&
              newMessage.user_id &&
              String(msg.user_id) === String(newMessage.user_id);
            const sameBody = msg.message === newMessage.message;
            if (sameAuthor && sameBody) {
              return false;
            }
          }
          return true;
        });

        return {
          ...state,
          replyChat: [newMessage, ...replyChat],
        };
      }

      // Pagination logic with double-check filter
      return {
        ...state,
        replyChat:
          action.payload.page === 1
            ? action.payload.data || []
            : [
                ...state.replyChat,
                ...(action.payload.data || []).filter(
                  (newItem: any) =>
                    !state.replyChat.some((oldItem: any) => {
                      const oldId = oldItem?.id ?? oldItem?.message_id;
                      const newId = newItem?.id ?? newItem?.message_id;
                      return oldId && newId && String(oldId) === String(newId);
                    }),
                ),
              ],
      };

    case ACTIONS.REPLY_CALLBACK:
      return { ...state, replyCallback: action.payload };

    case ACTIONS.UPDATE_REPLY_REACTIONS:
      return {
        ...state,
        replyChat: state.replyChat.map((message: any) => {
          const messageId = message?.id ?? message?.message_id;
          return String(messageId) === String(action.payload.messageId)
            ? { ...message, reactions: action.payload.reactions }
            : message;
        }),
      };

    // --------------- AGENTS SECTION --------------------------

    case ACTIONS.AGENTS:
      return { ...state, agents: action.payload };

    case ACTIONS.AGENT:
      return { ...state, agent: action.payload };

    case ACTIONS.AGENTS_CHAT:
      if (action.payload.newMessage) {
        const newMessage = action.payload.newMessage;

        // 1. If we receive a REAL message (from Centrifugo)
        if (!newMessage.isOptimistic) {
          // Filter out the optimistic placeholder AND any existing duplicate thread_id
          const cleanList = state.agentsChat.filter(
            msg => !msg.isOptimistic && msg.thread_id !== newMessage.thread_id,
          );

          return {
            ...state,
            agentsChat: [newMessage, ...cleanList],
          };
        }

        // 2. If it's the client's optimistic message, just add it
        return {
          ...state,
          agentsChat: [newMessage, ...state.agentsChat],
        };
      }

      // Pagination logic with double-check filter
      return {
        ...state,
        agentsChat:
          action.payload.page === 1
            ? action.payload.data || []
            : [
                ...state.agentsChat,
                ...(action.payload.data || []).filter(
                  (newItem: any) =>
                    !state.agentsChat.some(
                      (oldItem: any) => oldItem.thread_id === newItem.thread_id,
                    ),
                ),
              ],
      };

    case ACTIONS.AGENT_CALLBACK:
      return { ...state, agentCallback: action.payload };

    // =========BUZZ SECTION==================
    case ACTIONS.BUZZ_SIGNAL_UPDATE: {
      const { notification_type, buzzEventData } = action.payload;
      if (!buzzEventData?.channel_id) return state;
      if (notification_type === 'buzz_started') {
        const newUser = buzzEventData?.user_joined;
        return {
          ...state,
          userChannels: state.userChannels.map((channel: any) => {
            if (
              String(channel.channels_id) === String(buzzEventData.channel_id)
            ) {
              return {
                ...channel,
                active_buzz: {
                  buzz_id: buzzEventData?.buzz_id,
                  host_id: buzzEventData?.host_id,
                  host_name: newUser?.username || 'A participant',
                  participant_count:
                    buzzEventData?.participant_ids?.length || 1,
                  started_at: buzzEventData?.created_at,
                },
              };
            }
            return channel;
          }),
        };
      }
      if (notification_type === 'buzz_ended') {
        return {
          ...state,
          userChannels: state.userChannels.map((channel: any) => {
            if (
              String(channel.channels_id) === String(buzzEventData.channel_id)
            ) {
              const { active_buzz, ...restOfChannel } = channel;
              return restOfChannel;
            }
            return channel;
          }),
        };
      }
      return state;
    }
    case ACTIONS.BUZZ_DATA:
      return {
        ...state,
        buzzData: action.payload,
      };
    case ACTIONS.BUZZ_PARTICIPANTS:
      return {
        ...state,
        buzzParticipants: action.payload,
      };
    case ACTIONS.BUZZ_PARTICIPANT_MEDIA_PATCH:
      return {
        ...state,
        buzzParticipants: (state.buzzParticipants || []).map(
          (participant: any) => {
            const byUserId = action.payload.user_id
              ? String(participant?.user_id || participant?.id) ===
                String(action.payload.user_id)
              : false;
            const byAgoraUid =
              action.payload.agoraNumericUid != null
                ? Number(participant?.agoraNumericUid) ===
                  Number(action.payload.agoraNumericUid)
                : false;
            const byScreenAgoraUid =
              action.payload.screenAgoraNumericUid != null
                ? Number(participant?.screenAgoraNumericUid) ===
                  Number(action.payload.screenAgoraNumericUid)
                : false;

            if (!byUserId && !byAgoraUid && !byScreenAgoraUid) {
              return participant;
            }

            return {
              ...participant,
              ...(action.payload.agoraNumericUid != null
                ? { agoraNumericUid: action.payload.agoraNumericUid }
                : {}),
              ...(action.payload.screenAgoraNumericUid != null
                ? {
                    screenAgoraNumericUid: action.payload.screenAgoraNumericUid,
                  }
                : {}),
              ...(typeof action.payload.audioTrack === 'boolean'
                ? { audioTrack: action.payload.audioTrack }
                : {}),
              ...(typeof action.payload.videoTrack === 'boolean'
                ? { videoTrack: action.payload.videoTrack }
                : {}),
              ...(typeof action.payload.screenTrack === 'boolean'
                ? { screenTrack: action.payload.screenTrack }
                : {}),
            };
          },
        ),
      };
    case ACTIONS.BUZZ_PARTICIPANT_REMOVE:
      return {
        ...state,
        buzzParticipants: (state.buzzParticipants || []).filter(
          (participant: any) => {
            const byUserId = action.payload.user_id
              ? String(participant?.user_id || participant?.id) ===
                String(action.payload.user_id)
              : false;
            const byAgoraUid =
              action.payload.agoraNumericUid != null
                ? Number(participant?.agoraNumericUid) ===
                  Number(action.payload.agoraNumericUid)
                : false;

            return !byUserId && !byAgoraUid;
          },
        ),
      };
    case ACTIONS.HAS_JOINED:
      return {
        ...state,
        hasJoined: action.payload,
      };
    case ACTIONS.BUZZ_IS_MUTED:
      return {
        ...state,
        buzzIsMuted: action.payload,
      };
    case ACTIONS.BUZZ_SHOW_VIDEO:
      return {
        ...state,
        buzzShowVideo: action.payload,
      };
    case ACTIONS.BUZZ_IS_SCREEN_SHARING:
      return {
        ...state,
        buzzIsScreenSharing: action.payload,
      };
    case ACTIONS.BUZZ_JOIN_LOADING:
      return {
        ...state,
        buzzJoinLoading: action.payload,
      };
    case ACTIONS.CALL_MINIMIZED:
      return {
        ...state,
        isCallMinimized: action.payload,
      };
    case ACTIONS.CALL_MINIMIZED_FROM:
      return {
        ...state,
        minimizedFrom: action.payload,
      };
    case ACTIONS.RESET_DIRECT_CALL_SESSION:
      return {
        ...state,
        hasJoined: false,
        buzzData: null,
        buzzParticipants: [],
        buzzChats: [],
        floatingEmojis: [],
        buzzIsMuted: true,
        buzzShowVideo: false,
        buzzIsScreenSharing: false,
        buzzJoinLoading: false,
        isCallMinimized: false,
        minimizedFrom: null,
      };
    case ACTIONS.FLOATING_EMOJIS:
      return {
        ...state,
        floatingEmojis: action.payload,
      };
    case ACTIONS.ADD_FLOATING_EMOJI:
      return {
        ...state,
        floatingEmojis: [...(state.floatingEmojis || []), action.payload],
      };

    case ACTIONS.REMOVE_FLOATING_EMOJI:
      return {
        ...state,
        floatingEmojis: (state.floatingEmojis || []).filter(
          (e: any) => e.id !== action.payload,
        ),
      };
    case ACTIONS.BUZZ_CHATS:
      return {
        ...state,
        buzzChats: action.payload,
      };

    // ================= SETTINGS SECTION ==================
    case ACTIONS.STATUS_CALLBACK:
      return {
        ...state,
        statusCallback: action.payload,
      };

    case ACTIONS.BILLINGS:
      return {
        ...state,
        billings: action.payload,
      };

    // ================= MENTIONS SECTION ==================
    case ACTIONS.MENTIONS_LIST:
      return {
        ...state,
        mentionsList: action.payload,
      };

    case ACTIONS.UNSEEN_THREAD_COUNT:
      return {
        ...state,
        unseenThreadCount: action.payload,
      };

    case ACTIONS.LOAD_THREAD:
      return {
        ...state,
        loadThreadCallback: action.payload,
      };

    default:
      return state;
  }
};

export default reducers;
