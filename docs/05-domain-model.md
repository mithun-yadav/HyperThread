# Live Chat Platform — Domain Model

## 1. Purpose

This document defines the major business entities, relationships, responsibilities, and boundaries of the Live Chat Platform.

The domain model is a conceptual model.

It is not the final database schema.

The database design will be created later in Phase 10.

---

# 2. Core Domain

The core business domain is:

> Real-time communication between users through conversations and messages.

The most important domain concepts are:

- User
- Identity
- Session
- Device
- Conversation
- Conversation Member
- Message
- Message Receipt
- Presence
- Notification
- Media
- Report
- Audit Log

---

# 3. User

A User represents a platform account.

## Responsibilities

A user can:

- Own an account.
- Authenticate.
- Maintain a profile.
- Participate in conversations.
- Send messages.
- Receive messages.
- Manage devices.
- Configure preferences.

## Important Attributes

- User ID
- Email
- Username
- Display name
- Profile picture
- Account status
- Created timestamp
- Updated timestamp

The User ID should be globally unique.

---

# 4. Identity

Identity represents how a user authenticates.

A user may have:

- Password-based authentication
- OAuth identity
- Multiple linked authentication providers

## Important Concepts

- Identity ID
- User ID
- Provider
- Provider subject/identifier
- Credential metadata
- Created timestamp

Authentication identity should be separated conceptually from the User profile.

This allows additional authentication providers to be introduced later.

---

# 5. Session

A Session represents an authenticated login session.

A user may have multiple active sessions.

Examples:

- Web browser
- Mobile phone
- Tablet
- Desktop application

## Important Attributes

- Session ID
- User ID
- Device ID
- Refresh token metadata
- Created timestamp
- Last used timestamp
- Expiration timestamp
- Revoked timestamp

A revoked session must no longer be usable.

---

# 6. Device

A Device represents a client device associated with a user.

Examples:

- Android phone
- iPhone
- Web browser
- Desktop application

## Important Attributes

- Device ID
- User ID
- Device type
- Device name
- Push notification token
- Last active timestamp

A user may have multiple devices.

---

# 7. Conversation

A Conversation represents a communication space.

There are initially two major conversation types:

- Direct
- Group

## Direct Conversation

A direct conversation represents communication between two users.

The system should prevent accidental creation of multiple active direct conversations between the same participants.

## Group Conversation

A group conversation represents communication between multiple users.

A group may have:

- Name
- Creator
- Members
- Roles
- Created timestamp

---

# 8. Conversation Member

A Conversation Member represents a user's membership in a conversation.

This is an important domain entity because users and conversations have a many-to-many relationship.

## Important Attributes

- Conversation ID
- User ID
- Role
- Joined timestamp
- Left timestamp
- Membership status

## Possible Roles

- OWNER
- ADMIN
- MEMBER

Permissions depend on the member's role.

---

# 9. Message

A Message represents a piece of communication sent within a conversation.

## Important Attributes

- Message ID
- Conversation ID
- Sender ID
- Message type
- Content
- Created timestamp
- Updated timestamp
- Deleted timestamp

## Message Types

Initially:

- TEXT
- IMAGE
- VIDEO
- FILE
- SYSTEM

The design should allow additional message types later.

---

# 10. Message Lifecycle

A message can move through different delivery states.

Initial conceptual lifecycle:

```text
CREATED
   ↓
SENT
   ↓
DELIVERED
   ↓
READ
```
