import { MessageEventsService } from './message-events.service';

describe('MessageEventsService', () => {
  let service: MessageEventsService;

  beforeEach(() => {
    service = new MessageEventsService();
  });

  it('should register and invoke the message-edited handler', () => {
    const handler = jest.fn();
    const message = { id: 'message-1', content: 'Updated content' };
    const conversationId = 'conversation-1';

    service.registerMessageEditedHandler(handler);
    service.emitMessageEdited(conversationId, message);

    expect(handler).toHaveBeenCalledWith(conversationId, message);
  });

  it('should do nothing when no handler is registered', () => {
    expect(() =>
      service.emitMessageEdited('conversation-1', {
        id: 'message-1',
        content: 'Updated content',
      }),
    ).not.toThrow();
  });
});
