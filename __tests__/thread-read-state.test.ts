import { markThreadAsRead } from '../src/services/notification-navigation.service';
import reducers, { AppState } from '../src/store/Reducers';
import { ACTIONS, Action } from '../src/store/types';

// The service imports the navigation container, which pulls in ESM-only
// packages Jest cannot parse. Mock it so the module under test loads.
jest.mock('@/navigation/root-navigation', () => ({
  navigate: jest.fn(),
}));

// The requests helper pulls in AsyncStorage's native implementation,
// which is unavailable in Jest. It is not used by the code under test.
jest.mock('@/utils/requests', () => ({
  GetRequest: jest.fn(),
  PostRequest: jest.fn(),
}));

const createTestState = (overrides: Partial<AppState> = {}): AppState =>
  ({
    dms: [],
    userChannels: [],
    ...overrides,
  }) as AppState;

describe('markThreadAsRead', () => {
  it('marks a DM thread as read by resetting the unread count', () => {
    const dispatch = jest.fn();

    markThreadAsRead(dispatch, 'dm', 'chat-123');

    expect(dispatch).toHaveBeenCalledWith({
      type: ACTIONS.RESET_DM_THREAD_COUNT,
      payload: 'chat-123',
    });
  });

  it('marks a group DM thread as read by resetting the unread count', () => {
    const dispatch = jest.fn();

    markThreadAsRead(dispatch, 'group_dm', 'chat-123');

    expect(dispatch).toHaveBeenCalledWith({
      type: ACTIONS.RESET_DM_THREAD_COUNT,
      payload: 'chat-123',
    });
  });

  it('marks a channel thread as read by resetting the unread count', () => {
    const dispatch = jest.fn();

    markThreadAsRead(dispatch, 'channel', 'channel-456');

    expect(dispatch).toHaveBeenCalledWith({
      type: ACTIONS.RESET_CHANNEL_THREAD_COUNT,
      payload: 'channel-456',
    });
  });
});

describe('unread thread count reducers', () => {
  it('resets the unread count of the matching DM conversation only', () => {
    const state = createTestState({
      dms: [
        { channel_id: 'chat-123', thread_count: 4 } as any,
        { channel_id: 'chat-789', thread_count: 2 } as any,
      ],
    });

    const next = reducers(state, {
      type: ACTIONS.RESET_DM_THREAD_COUNT,
      payload: 'chat-123',
    } as Action);

    expect(next.dms[0].thread_count).toBe(0);
    expect(next.dms[1].thread_count).toBe(2);
  });

  it('resets the unread and mention counts of the matching channel', () => {
    const state = createTestState({
      userChannels: [
        {
          channels_id: 'channel-456',
          thread_count: 3,
          mention_count: 1,
        } as any,
      ],
    });

    const next = reducers(state, {
      type: ACTIONS.RESET_CHANNEL_THREAD_COUNT,
      payload: 'channel-456',
    } as Action);

    expect(next.userChannels[0].thread_count).toBe(0);
    expect(next.userChannels[0].mention_count).toBe(0);
  });

  it('resets the unread count when the action and stored ids differ in type', () => {
    // Notification payloads coerce ids to strings while store entries can
    // carry raw numeric ids from the API; the reset must still match.
    const state = createTestState({
      dms: [{ channel_id: 123, thread_count: 5 } as any],
      userChannels: [
        { channels_id: 456, thread_count: 2, mention_count: 0 } as any,
      ],
    });

    const dmState = reducers(state, {
      type: ACTIONS.RESET_DM_THREAD_COUNT,
      payload: '123',
    } as Action);

    expect(dmState.dms[0].thread_count).toBe(0);

    const channelState = reducers(state, {
      type: ACTIONS.RESET_CHANNEL_THREAD_COUNT,
      payload: '456',
    } as Action);

    expect(channelState.userChannels[0].thread_count).toBe(0);
  });

  it('clears unread counts when a thread is opened or replied to', () => {
    const dispatch = jest.fn();

    // Opening or replying in a DM thread marks it as read…
    markThreadAsRead(dispatch, 'dm', 'chat-123');
    const dmState = reducers(
      createTestState({
        dms: [{ channel_id: 'chat-123', thread_count: 4 } as any],
      }),
      dispatch.mock.calls[0][0] as Action,
    );

    expect(dmState.dms[0].thread_count).toBe(0);

    // …and the same holds for channel threads.
    markThreadAsRead(dispatch, 'channel', 'channel-456');
    const channelState = reducers(
      createTestState({
        userChannels: [
          {
            channels_id: 'channel-456',
            thread_count: 3,
            mention_count: 2,
          } as any,
        ],
      }),
      dispatch.mock.calls[1][0] as Action,
    );

    expect(channelState.userChannels[0].thread_count).toBe(0);
    expect(channelState.userChannels[0].mention_count).toBe(0);
  });
});
