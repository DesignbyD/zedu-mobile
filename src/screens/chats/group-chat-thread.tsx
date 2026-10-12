import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, FlatList, Keyboard, ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { createChatDetailStyles } from '@/theme/createScreenStyles';
import Container from '@/components/layout/container';
import { launchCamera } from 'react-native-image-picker';
import { ThemedEmojiKeyboard } from '@/components/ui/themed-emoji-keyboard';
import ChatInput from '@/components/layout/chat/chat-input';
import ChatKeyboardAvoidingView from '@/components/layout/chat/chat-keyboard-avoiding-view';
import { useTyping } from '@/hooks/useTyping';
import { MediaPickerSheet } from '@/components/layout/chat/media-picker';
import MediaEditorModal from '@/components/layout/chat/media-editor';
import ThreadItem from '@/components/layout/channels/thread-item';
import { Channel } from '@/types/channel';
import { useDataContext } from '@/store/useDataContext';
import UseReplyChat from '@/services/channels/use-reply';
import { ACTIONS } from '@/store/types';
import { PostRequest } from '@/utils/requests';
import { useFileUpload } from '@/hooks/useFileUpload';
import ReplyConnection from '@/centrifugoo/reply-connection';
import ThreadMessageItem from '@/components/layout/channels/thread-message-item';
import ChatBackground from '@/components/layout/chat/chat-background';
import {
  getThreadMessageCallbackAction,
  getThreadMessageSendUrl,
} from '@/utils/thread-message';
import { ReplyMessageAction } from '@/components/layout/chat/reply-message-action';
import { ShowNotify } from '@/components/ui/toast';
import uuid from 'react-native-uuid';
import MentionUserBottomSheet, {
  MentionUserBottomSheetRef,
} from '@/components/layout/chat/mention-user-bottomsheet';
import ThreadScreenHeader from '@/components/layout/chat/thread-screen-header';
import { markThreadAsRead } from '@/services/notification-navigation.service';

const GroupChatThreadScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createChatDetailStyles(colors), [colors]);
  const [message, setMessage] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const actionSheetRef = useRef<any>(null);
  const pickerSheetRef = useRef<any>(null);
  const mentionUserSheetRef = useRef<MentionUserBottomSheetRef>(null);
  const [selectedMsg, setSelectedMsg] = useState<Channel | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    uri: string;
    type: 'image' | 'file';
  } | null>(null);
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const { state, dispatch } = useDataContext();
  const { handleTyping } = useTyping(state.replySubscription);
  const {
    media,
    replyChat,
    selectedMsg: selectedMessage,
    channel: _channel,
    participant,
  } = state;
  const { thread_id, channel_id } = route.params;

  const { loadMore, isFetchingMore } = UseReplyChat({
    channel_id: channel_id as string,
    thread_id: thread_id,
  });

  const { uploadFiles, clearUploads } = useFileUpload();

  useEffect(() => {
    markThreadAsRead(dispatch, 'group_dm', channel_id);
  }, [channel_id, dispatch]);

  const [isVoiceUploading, setIsVoiceUploading] = useState(false);

  const handleVoiceRecorded = async (uri: string) => {
    setIsVoiceUploading(true);
    const tempId = uuid.v4() as string;
    const asset = {
      uri,
      type: 'audio/m4a',
      name: uri.split('/').pop() || `voice_${tempId}`,
    };
    try {
      const response = await uploadFiles([asset]);
      if (response.data && response.data.length > 0) {
        dispatch({ type: ACTIONS.MEDIA, payload: response.data });
      } else {
        ShowNotify('Error', 'Voice upload failed');
      }
    } catch (_err) {
      ShowNotify('Error', 'Voice upload failed');
    } finally {
      setIsVoiceUploading(false);
    }
  };

  const handleVoiceSendReady = () => {
    handleSendMessage('', media);
  };

  const handleVoiceCancel = () => {
    dispatch({ type: ACTIONS.MEDIA, payload: [] });
    clearUploads();
  };

  const handleMediaPicker = () => {
    pickerSheetRef.current?.expand();
  };

  const handleSendMessage = async (content: string, medias: any[] = []) => {
    if (!content.trim() && medias.length === 0) return;

    handleTyping(false);

    const formattedContent = `<p>${content}</p>`;

    const optimisticMessage = {
      channels_id: channel_id,
      id: channel_id,
      thread_id: thread_id,
      username: state.user?.username || 'You',
      avatar_url: state.user?.avatar_url,
      message: formattedContent,
      created_at: new Date().toISOString(),
      status: 'pending',
      type: 'message',
      media: medias,
      user_id: state.user?.user_id,
      reactions: null,
      isOptimistic: true,
    };

    dispatch({
      type: ACTIONS.REPLY_CHAT,
      payload: { newMessage: optimisticMessage },
    });

    setMessage('');

    const payload = {
      channels_id: channel_id,
      thread_id: thread_id,
      content: formattedContent,
      media: medias,
      user_id: state.user?.user_id,
    };

    await PostRequest(getThreadMessageSendUrl('group_dm', channel_id), payload);
    markThreadAsRead(dispatch, 'group_dm', channel_id);
    dispatch({
      type: getThreadMessageCallbackAction('group_dm'),
      payload: !state.callback,
    });

    dispatch({ type: ACTIONS.MEDIA, payload: [] });
    clearUploads();
  };

  const pickImage = async () => {
    const result = await launchCamera({
      mediaType: 'photo',
      quality: 0.6,
      maxWidth: 1024,
      maxHeight: 1024,
    });
    if (result.assets && result.assets[0].uri) {
      setPendingMedia({ uri: result.assets[0].uri, type: 'image' });
      setIsEditorVisible(true);
      const response = await uploadFiles(result.assets);
      dispatch({ type: ACTIONS.MEDIA, payload: response.data });
    }
  };

  const handleSendFromEditor = (caption: string) => {
    if (pendingMedia) {
      handleSendMessage(caption, media);
    }
    setIsEditorVisible(false);
    setPendingMedia(null);
    dispatch({ type: ACTIONS.MEDIA, payload: [] });
  };

  const handleEmojiSelect = (emojiObject: any) => {
    if (!isEmojiOpen) {
      Keyboard.dismiss();
    }
    setMessage(prev => prev + emojiObject.emoji);
  };

  const onClose = () => {
    setSelectedMsg(null);
  };

  const handleLongPress = (item: Channel) => {
    setSelectedMsg(item);
  };

  const groupReferenceLabel =
    Array.isArray(participant) && participant.length > 0
      ? participant.map((p: any) => p.username).join(', ')
      : 'Group chat';

  const handleMentionUser = (userId: string) => {
    if (!participant || !Array.isArray(participant)) {
      return;
    }

    const found = participant.find((p: any) => p.user_id === userId);

    if (found) {
      mentionUserSheetRef.current?.open(found);
    }
  };

  return (
    <Container color={colors.topNavigation}>
      <ReplyConnection id={thread_id as string} />
      <ThreadScreenHeader
        navigation={navigation}
        referenceType="group"
        referenceLabel={groupReferenceLabel}
      />

      <ChatBackground />

      <FlatList
        ref={flatListRef}
        data={replyChat}
        inverted
        keyExtractor={item => String(item.id ?? item.message_id)}
        extraData={replyChat}
        renderItem={({ item, index }) => (
          <ThreadMessageItem
            item={{
              ...item,
              id: item.id ?? item.message_id,
              text: item.message || '',
              message: item.message || '',
            }}
            index={index}
            messages={replyChat}
            inverted={true}
            onLongPress={() => handleLongPress(item)}
            onMentionUser={handleMentionUser}
          />
        )}
        ListFooterComponent={
          <ThreadItem
            item={selectedMessage}
            onMentionUser={handleMentionUser}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.1}
        ListHeaderComponent={() =>
          isFetchingMore ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ margin: 10 }}
            />
          ) : null
        }
      />

      {selectedMsg && (
        <ReplyMessageAction
          ref={actionSheetRef}
          item={selectedMsg}
          onClose={onClose}
        />
      )}

      <MediaPickerSheet
        ref={pickerSheetRef}
        setPendingMedia={setPendingMedia}
        setIsEditorVisible={setIsEditorVisible}
      />

      {pendingMedia && (
        <MediaEditorModal
          visible={isEditorVisible}
          media={pendingMedia}
          onClose={() => {
            setIsEditorVisible(false);
            setPendingMedia(null);
          }}
          onSend={handleSendFromEditor}
        />
      )}

      <ChatKeyboardAvoidingView>
        <ChatInput
          message={message}
          setMessage={setMessage}
          onTypingChange={handleTyping}
          onSend={(content: any) => handleSendMessage(content)}
          onVoiceRecorded={handleVoiceRecorded}
          onVoiceSendReady={handleVoiceSendReady}
          onVoiceCancel={handleVoiceCancel}
          isVoiceUploading={isVoiceUploading}
          onPickImage={pickImage}
          onMediaPicker={handleMediaPicker}
          onOpenEmoji={() => setIsEmojiOpen(true)}
          onCloseEmoji={() => setIsEmojiOpen(false)}
          isEmojiOpen={isEmojiOpen}
          onFocus={() => pickerSheetRef.current?.close()}
        />

        {isEmojiOpen && (
          <View style={styles.emojiWrapper}>
            <ThemedEmojiKeyboard
              onEmojiSelected={handleEmojiSelect}
              enableRecentlyUsed
              categoryPosition="bottom"
              enableSearchBar
              disableSafeArea={true}
              allowMultipleSelections
              emojiSize={25}
              containerStyle={{
                container: {
                  borderRadius: 0,
                },
              }}
            />
          </View>
        )}
      </ChatKeyboardAvoidingView>

      <MentionUserBottomSheet ref={mentionUserSheetRef} />
    </Container>
  );
};

export default GroupChatThreadScreen;
