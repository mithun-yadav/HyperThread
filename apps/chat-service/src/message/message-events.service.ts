import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageEventsService {
  private emitMessageEditedHandler?: (
    conversationId: string,
    message: unknown,
  ) => void;

  private emitMessageDeletedHandler?: (
    conversationId: string,
    message: unknown,
  ) => void;

  registerMessageEditedHandler(
    handler: (conversationId: string, message: unknown) => void,
  ): void {
    this.emitMessageEditedHandler = handler;
  }
  emitMessageEdited(conversationId: string, message: unknown): void {
    this.emitMessageEditedHandler?.(conversationId, message);
  }

  registerMessageDeleteHandler(
    handler: (conversationId: string, message: unknown) => void,
  ): void {
    this.emitMessageDeletedHandler = handler;
  }

  emitMessageDeleted(conversationId: string, message: unknown): void {
    this.emitMessageDeletedHandler?.(conversationId, message);
  }
}
