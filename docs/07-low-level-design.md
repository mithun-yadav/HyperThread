# Live Chat Platform — Low-Level Design

## 1. Purpose

This document defines the low-level technical design of the Live Chat Platform.

The goal is to translate the High-Level Design into concrete implementation-level rules for:

- Microservice internals
- Modules
- Controllers
- Application services
- Domain logic
- Repositories
- Database access
- Redis access
- Kafka communication
- API communication
- Authentication
- Authorization
- Validation
- Transactions
- Idempotency
- Error handling
- Retry handling
- Realtime communication
- Observability

This document defines implementation principles.

The exact database schema, Kafka topics, Redis keys, and service folder structures are defined in later phases.

---

## 2. General Service Architecture

Each microservice should follow a modular structure:

Controller
    ↓
Application Service
    ↓
Domain Logic
    ↓
Repository / Infrastructure
    ↓
Database / External System

The service should separate business logic from infrastructure concerns.

Recommended internal structure:

src/
├── modules/
│   └── <module>/
│       ├── controllers/
│       ├── services/
│       ├── domain/
│       ├── repositories/
│       ├── dto/
│       └── entities/
│
├── infrastructure/
│   ├── database/
│   ├── redis/
│   ├── kafka/
│   └── external/
│
├── common/
│   ├── errors/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   ├── filters/
│   └── utilities/
│
├── config/
└── main.ts

Not every service must contain every directory.

The structure should remain simple and match the service's responsibilities.

---

## 3. Controller Layer

Controllers handle external requests.

Responsibilities:

- Receive HTTP requests
- Validate input
- Authenticate requests
- Authorize access
- Call application services
- Return HTTP responses
- Map errors to HTTP responses

Controllers should NOT contain complex business logic.

Controllers should remain thin.

Flow:

HTTP Request
    ↓
Controller
    ↓
DTO Validation
    ↓
Application Service
    ↓
Response

---

## 4. Application Service Layer

Application services coordinate use cases.

Examples:

- CreateUser
- LoginUser
- CreateConversation
- SendMessage
- MarkMessageAsRead
- UpdatePresence
- UploadMedia
- SearchMessages

Responsibilities:

- Coordinate domain operations
- Call repositories
- Start transactions where required
- Enforce application-level rules
- Publish domain/integration events
- Coordinate external dependencies

Application services should not contain HTTP-specific logic.

---

## 5. Domain Layer

The domain layer contains business rules.

Core domain concepts include:

- User
- Identity
- Session
- Device
- Conversation
- ConversationMember
- Message
- MessageReceipt
- Presence
- Connection
- Notification
- Media
- Report
- AuditLog

Example business rule:

A user cannot send a message to a conversation unless the user is a valid member.

Other examples:

- A deleted message cannot be modified normally.
- Only authorized users can add members to a group.
- Only authorized users can remove members.
- A user cannot access conversations they do not belong to.

Business rules should not depend directly on:

- HTTP
- PostgreSQL
- Redis
- Kafka
- NestJS controllers

This keeps the core business logic testable.

---

## 6. Repository Layer

Repositories abstract persistence.

Examples:

- UserRepository
- ConversationRepository
- MessageRepository
- NotificationRepository
- MediaRepository

Responsibilities:

- Read data
- Write data
- Update data
- Delete data where applicable
- Execute database-specific operations

Application/domain logic should depend on repository interfaces rather than database implementation details.

Flow:

Application Service
    ↓
Repository Interface
    ↓
PostgreSQL Repository
    ↓
Prisma / PostgreSQL

---

## 7. Infrastructure Layer

Infrastructure contains external system implementations.

Examples:

- PostgreSQL
- Redis
- Kafka
- Object Storage
- Email Provider
- Search Engine

Infrastructure should implement interfaces required by the application.

Example:

Application
    ↓
Cache Interface
    ↓
Redis Cache Implementation

This prevents business logic from becoming tightly coupled to infrastructure.

---

## 8. Dependency Injection

NestJS dependency injection should be used throughout the application.

Dependencies should be injected rather than manually instantiated.

Avoid creating repositories/services directly inside business logic.

Prefer constructor-based dependency injection.

Benefits:

- Testability
- Maintainability
- Replaceability
- Clear dependency management

---

## 9. API Gateway Request Flow

All public API traffic should normally pass through the API Gateway.

Flow:

Client
    ↓
API Gateway
    ↓
Authentication
    ↓
Authorization / Rate Limiting
    ↓
Target Microservice
    ↓
Application Service
    ↓
Repository / External System

The Gateway should handle cross-cutting concerns such as:

- Authentication verification
- Rate limiting
- Request ID
- Correlation ID
- Request logging
- Routing
- Basic request validation
- API versioning
- Security headers

Business logic should remain inside the appropriate service.

---

## 10. Authentication Flow

Authentication should use:

- Access Token
- Refresh Token

Typical login flow:

Client
    ↓
API Gateway
    ↓
Auth Service
    ↓
Validate Credentials
    ↓
Password Hash Verification
    ↓
Create Session
    ↓
Generate Access Token
    ↓
Generate Refresh Token
    ↓
Return Tokens

Passwords must never be stored in plaintext.

Use a strong password hashing algorithm such as Argon2id or another approved secure password hashing implementation.

---

## 11. Refresh Token Flow

Refresh tokens should be rotated.

Flow:

Client
    ↓
Refresh Token
    ↓
Auth Service
    ↓
Validate Token
    ↓
Validate Session
    ↓
Invalidate Previous Refresh Token
    ↓
Create New Refresh Token
    ↓
Create New Access Token
    ↓
Return Tokens

Token reuse should be detected where practical.

Suspicious refresh-token reuse should invalidate the affected session/token family.

---

## 12. Email Verification

Registration flow:

Client
    ↓
Auth Service
    ↓
Create User
    ↓
Create Verification Token
    ↓
Publish Email Verification Event
    ↓
Notification Service
    ↓
Email Provider

Verification tokens should:

- Be cryptographically random
- Be short-lived
- Be single-use
- Be stored securely
- Never be logged

---

## 13. Forgot Password Flow

Flow:

Client
    ↓
Request Password Reset
    ↓
Auth Service
    ↓
Create Temporary Reset Token
    ↓
Publish Password Reset Event
    ↓
Notification Service
    ↓
Email

Password reset token rules:

- Short expiration
- Single use
- Secure random value
- No password information in logs

After successful password reset, existing sessions should be invalidated where required by the security policy.

---

## 14. User Creation Flow

Flow:

Client
    ↓
API Gateway
    ↓
Auth Service
    ↓
Validate Registration
    ↓
Hash Password
    ↓
Create User
    ↓
Create Identity / Session Data
    ↓
Publish UserCreated Event

The User Service owns user profile data.

The Auth Service owns authentication credentials and authentication-related state.

---

## 15. Direct Conversation Creation

A direct conversation represents communication between users.

Flow:

Client
    ↓
API Gateway
    ↓
Chat Service
    ↓
Validate Users
    ↓
Check Existing Conversation
    ↓
Create Conversation
    ↓
Create Conversation Members
    ↓
Commit Transaction
    ↓
Publish ConversationCreated Event

The database transaction should ensure:

Conversation
+
Conversation Members

are created atomically.

Duplicate direct conversations should be prevented using appropriate database constraints and/or application-level checks.

---

## 16. Group Conversation Creation

Flow:

Client
    ↓
API Gateway
    ↓
Chat Service
    ↓
Validate Request
    ↓
Create Conversation
    ↓
Create Owner/Admin Membership
    ↓
Create Other Members
    ↓
Commit Transaction
    ↓
Publish GroupCreated Event

The creator becomes the initial group owner/admin.

Authorization rules must control later membership changes.

---

## 17. Send Message Flow

Message sending is a critical path.

Recommended flow:

Client
    ↓
API Gateway
    ↓
Message Service
    ↓
Authenticate User
    ↓
Validate Conversation Membership
    ↓
Validate Message
    ↓
Check Idempotency
    ↓
Persist Message
    ↓
Publish MessageCreated Event
    ↓
Return Message

The message should receive a server-generated identifier.

The client may also provide a client-generated idempotency key/message ID.

This prevents accidental duplicate messages when the client retries.

---

## 18. Message Persistence

The Message Service owns message persistence.

Conceptual model:

Conversation
    |
    └── Messages
            |
            ├── Sender
            ├── Content
            ├── Type
            ├── CreatedAt
            └── Status

Message data should be stored durably before reporting successful persistence.

For high-volume systems:

- Index conversation ID
- Index creation time
- Use cursor pagination
- Avoid offset pagination for large message histories

---

## 19. Message Idempotency

Message creation must be idempotent.

Example:

Client sends message
    ↓
Request fails due to network
    ↓
Client retries
    ↓
Server receives same idempotency key
    ↓
Server detects existing message
    ↓
Return existing message

Do not create a second message.

A unique database constraint should enforce idempotency where appropriate.

---

## 20. Message Delivery

After persistence:

Message Service
    ↓
Kafka
    ↓
MessageCreated Event
    ↓
Consumers

Potential consumers:

- Realtime Delivery
- Notification
- Analytics
- Search

The Message Service should not directly depend on every downstream service.

Kafka provides decoupling.

---

## 21. Realtime Message Delivery

A realtime-capable service maintains client connections.

Conceptual flow:

Message Service
    ↓
Kafka
    ↓
Realtime Consumer
    ↓
Connection Registry
    ↓
WebSocket
    ↓
Recipient

If the recipient is online:

Deliver immediately.

If offline:

Persist message
+
Generate notification if applicable.

Message persistence must not depend on successful realtime delivery.

---

## 22. Message Read Flow

Flow:

Client
    ↓
Message Read Request
    ↓
Message Service
    ↓
Validate Membership
    ↓
Validate Message
    ↓
Update Receipt
    ↓
Publish MessageRead Event

Read state may be represented using MessageReceipt.

The system should avoid updating every historical message unnecessarily when a conversation-level read cursor can represent the same state.

---

## 23. Message Retrieval

Messages should support cursor-based pagination.

Example conceptual API:

GET /conversations/{conversationId}/messages?before=<cursor>&limit=50

Flow:

Client
    ↓
Message Service
    ↓
Validate Membership
    ↓
Query Messages
    ↓
Apply Cursor
    ↓
Return Page

Prefer cursor pagination over large offset pagination.

---

## 24. Presence Flow

Presence represents whether a user is:

- ONLINE
- OFFLINE
- AWAY

Presence is highly dynamic.

Redis should normally be used for fast presence state.

Flow:

Client Connected
    ↓
Presence Service
    ↓
Redis
    ↓
ONLINE

Disconnect:

Client Disconnected
    ↓
Presence Service
    ↓
Redis
    ↓
OFFLINE

Presence state should use TTL/heartbeat mechanisms to handle abnormal disconnects.

---

## 25. Presence Heartbeat

Clients should periodically send heartbeats.

Flow:

Client
    ↓
Heartbeat
    ↓
Presence Service
    ↓
Refresh Redis TTL

If the TTL expires:

User considered offline.

This prevents users remaining permanently online after crashes or network failures.

---

## 26. Typing Indicators

Typing indicators are temporary realtime state.

They should generally NOT be persisted in PostgreSQL.

Flow:

Client
    ↓
WebSocket
    ↓
Realtime / Presence Layer
    ↓
Recipient WebSocket

Typing state should expire automatically.

---

## 27. Notification Flow

Notifications should be asynchronous.

Flow:

MessageCreated
    ↓
Kafka
    ↓
Notification Service
    ↓
Check User Preferences
    ↓
Create Notification
    ↓
Push / Email / Other Channel

Notification delivery failure should not cause message creation failure.

---

## 28. Media Upload Flow

Large media files should not normally pass through application servers unnecessarily.

Recommended flow:

Client
    ↓
Media Service
    ↓
Generate Upload Authorization
    ↓
Object Storage
    ↓
Upload Media
    ↓
Media Service
    ↓
Persist Metadata

The application stores metadata such as:

- Media ID
- Owner
- File Type
- File Size
- Storage Key
- Created At
- Status

File validation must include:

- File type
- File size
- Authorization
- Malware/security scanning where required

---

## 29. Search Flow

Search should be isolated from transactional message persistence.

Conceptual flow:

Message Created
    ↓
Kafka
    ↓
Search Consumer
    ↓
Search Index

Search requests:

Client
    ↓
API Gateway
    ↓
Search Service
    ↓
Search Index
    ↓
Results

Search indexing failure should not prevent message persistence.

---

## 30. Cross-Service Communication

Two communication types are used.

### Synchronous Communication

Use REST when an immediate response is required.

Service A
    ↓
HTTP
    ↓
Service B

Examples:

- Auth validation
- User lookup
- Permission check

### Asynchronous Communication

Use Kafka for events.

Service A
    ↓
Kafka
    ↓
Service B

Examples:

- UserCreated
- MessageCreated
- ConversationCreated
- NotificationRequested
- MediaUploaded

---

## 31. Database Transaction Boundaries

Transactions should be kept inside the owning service.

Example:

BEGIN TRANSACTION

Create Conversation
Create Conversation Members

COMMIT

Do NOT create distributed database transactions across microservices.

For cross-service workflows use:

- Events
- Retries
- Idempotency
- Compensation
- Saga-style workflows where necessary

---

## 32. Transaction Design

Transactions should be:

- Short
- Explicit
- Atomic
- Consistent
- Isolated
- Durable

Avoid performing slow external operations inside database transactions.

Bad pattern:

BEGIN
    Database write
    HTTP request
    Email
    Kafka network operation
COMMIT

Better pattern:

BEGIN
    Database write
COMMIT

Publish or trigger asynchronous work after the transaction.

---

## 33. Optimistic Concurrency

Use optimistic concurrency where multiple clients may update the same logical resource.

Possible fields:

- version
- updatedAt

Example conceptual update:

UPDATE conversation
SET name = ?, version = version + 1
WHERE id = ?
AND version = ?

If zero rows are updated:

Concurrency conflict.

The client/application can retry or return an appropriate conflict response.

---

## 34. Error Handling

Use consistent application errors.

Conceptual structure:

Application Error
    ↓
Error Code
    ↓
HTTP Mapping

Example error codes:

- CONVERSATION_NOT_FOUND
- MESSAGE_NOT_FOUND
- NOT_CONVERSATION_MEMBER
- INVALID_REFRESH_TOKEN
- EMAIL_NOT_VERIFIED
- RATE_LIMIT_EXCEEDED

Avoid exposing internal database errors to clients.

---

## 35. HTTP Status Codes

Use standard HTTP status codes.

Examples:

- 200 OK
- 201 Created
- 204 No Content
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 422 Unprocessable Entity
- 429 Too Many Requests
- 500 Internal Server Error
- 503 Service Unavailable

The exact API error format should be standardized during API design.

---

## 36. Input Validation

All external input must be validated.

Validate:

- Request body
- Query parameters
- Route parameters
- Headers where required
- File metadata
- Pagination values

Reject invalid input before business logic execution.

NestJS validation mechanisms should be used consistently.

---

## 37. Authorization

Authentication answers:

Who are you?

Authorization answers:

What are you allowed to do?

Examples:

- Only conversation members can read messages.
- Only group admins can remove members.
- Only authorized users can modify group settings.
- Only message owners or authorized administrators can perform certain message actions.

Authorization must be enforced server-side.

Never trust the client.

---

## 38. Redis Strategy

Redis should be used for temporary/high-speed state.

Potential uses:

- Caching
- Presence
- Sessions
- Rate Limiting
- Temporary Tokens
- Distributed Locks where necessary

Redis should NOT become the permanent source of truth for critical data that belongs in PostgreSQL.

General rule:

PostgreSQL = Source of Truth
Redis = Fast / Temporary State

Cache invalidation must be explicitly designed.

---

## 39. Cache Pattern

Recommended pattern:

Request
    ↓
Check Redis
    ↓
Cache Hit → Return
    ↓
Cache Miss
    ↓
PostgreSQL
    ↓
Store in Redis
    ↓
Return

When data changes:

Update PostgreSQL
    ↓
Invalidate / Update Redis

Cache TTLs should be defined according to data type.

---

## 40. Redis Failure Handling

Redis failure should not automatically bring down the entire platform.

For non-critical caches:

Redis unavailable
    ↓
Fallback to database

For critical temporary state such as rate limiting or presence:

Define explicit degraded behavior.

Do not silently assume Redis is always available.

---

## 41. Kafka Event Flow

Events should follow:

Producer
    ↓
Kafka Topic
    ↓
Consumer
    ↓
Business Processing

Each event must define:

- Producer
- Consumer
- Topic
- Payload
- Event Version
- Retry Strategy
- DLQ Strategy
- Idempotency Strategy

Example:

Event:
MessageCreated

Producer:
Message Service

Consumers:
- Notification Service
- Search Service
- Realtime Service
- Analytics Service

---

## 42. Kafka Consumer Idempotency

Consumers must assume duplicate events can occur.

Flow:

Event received
    ↓
Check processed event / business idempotency key
    ↓
Already processed?
    ├── YES → Ignore
    └── NO  → Process

Never assume exactly-once delivery at the application level.

Design consumers to be safely repeatable.

---

## 43. Kafka Retry Strategy

Transient failures should be retried.

Example:

Kafka Event
    ↓
Consumer
    ↓
Processing Failed
    ↓
Retry
    ↓
Retry
    ↓
Retry
    ↓
DLQ

Retries should use controlled backoff.

Do not retry permanent failures indefinitely.

---

## 44. Dead Letter Queue

Events that cannot be successfully processed after the retry policy should move to a DLQ.

Flow:

Main Topic
    ↓
Consumer
    ↓
Retry
    ↓
Retry
    ↓
DLQ

DLQ messages should retain enough information for debugging and replay.

---

## 45. External Service Timeouts

Every external network call must have a timeout.

Examples:

- HTTP timeout
- Database timeout
- Redis timeout
- Kafka timeout
- Object storage timeout
- Email provider timeout

Never allow a request to wait indefinitely.

---

## 46. Retry Rules

Retry only failures that are potentially transient.

Good retry candidates:

- Timeout
- Temporary network error
- 503 Service Unavailable
- Temporary dependency failure

Avoid automatic retries for:

- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- Invalid data
- Business rule violations

Retries must be bounded.

---

## 47. Circuit Breaker

For unstable external dependencies, circuit breakers may be used.

Conceptual states:

CLOSED
    ↓
Failures increase
    ↓
OPEN
    ↓
Wait
    ↓
HALF-OPEN
    ↓
Test request

Circuit breakers prevent cascading failures.

---

## 48. Request Context

Every request should have:

- Request ID
- Correlation ID
- User ID where available
- Service Name
- Timestamp

Example:

Client
    ↓
API Gateway
    request-id: abc123
    correlation-id: xyz789
    ↓
Auth Service
    ↓
Message Service
    ↓
Kafka

These identifiers must be propagated across service boundaries where possible.

---

## 49. Logging

Use structured logs.

Example conceptual structure:

{
  "level": "info",
  "service": "message-service",
  "event": "message_created",
  "messageId": "123",
  "conversationId": "456",
  "requestId": "abc"
}

Never log:

- Passwords
- Access tokens
- Refresh tokens
- Verification tokens
- Reset tokens
- Sensitive personal information

---

## 50. Observability

Each service should expose:

- Health checks
- Metrics
- Structured logs
- Distributed tracing

Important metrics include:

- Request latency
- Request count
- Error rate
- Database latency
- Redis latency
- Kafka consumer lag
- Kafka processing failures
- WebSocket connections
- Message throughput
- CPU
- Memory

Distributed tracing should connect requests across services.

---

## 51. API Response Design

Responses should be consistent.

Example conceptual success response:

{
  "data": {
    "id": "123"
  },
  "meta": {
    "requestId": "abc123"
  }
}

Example conceptual error response:

{
  "error": {
    "code": "MESSAGE_NOT_FOUND",
    "message": "Message not found"
  },
  "meta": {
    "requestId": "abc123"
  }
}

The exact response contract will be standardized during API design.

---

## 52. Pagination

Large collections must use pagination.

Examples:

- Messages
- Users
- Conversations
- Notifications
- Search Results
- Audit Logs

Prefer cursor pagination over large OFFSET pagination for high-volume datasets.

---

## 53. Realtime Connection Architecture

WebSocket connections should be treated as ephemeral.

Conceptual architecture:

Client
    ↓
Load Balancer
    ↓
Realtime Gateway Instances
    ↓
Connection Registry
    ↓
Redis

Multiple realtime instances must be able to locate users connected to different instances.

Redis Pub/Sub or another suitable distributed mechanism may be used where required.

---

## 54. WebSocket Authentication

WebSocket connections must be authenticated.

Flow:

Client
    ↓
WebSocket Connection
    ↓
Authenticate Token
    ↓
Validate Session
    ↓
Register Connection

Unauthorized connections must be rejected.

Token expiration and connection lifecycle must be handled explicitly.

---

## 55. Service Dependency Rules

Services should have clear ownership.

Auth Service:
Owns authentication.

User Service:
Owns user profiles.

Chat Service:
Owns conversations.

Message Service:
Owns messages.

Presence Service:
Owns presence.

Notification Service:
Owns notifications.

Media Service:
Owns media metadata.

Search Service:
Owns search indexes.

Avoid shared database ownership.

A service should not directly modify another service's database tables.

---

## 56. Database Ownership

Each service should own its persistence boundary.

Conceptually:

Auth Service
    ↓
Auth Database

User Service
    ↓
User Database

Chat Service
    ↓
Chat Database

Message Service
    ↓
Message Database

Whether these are separate PostgreSQL databases or separate schemas is an infrastructure decision to be finalized later.

The architectural rule is:

One service owns its data.

Other services access it through APIs/events.

---

## 57. Data Consistency

Not every operation requires strong consistency.

Use strong consistency for:

- Authentication
- Security-critical state
- Membership authorization
- Message persistence
- Critical identity data

Eventual consistency is acceptable for:

- Search indexes
- Analytics
- Notifications
- Some presence propagation
- Derived counters

Consistency requirements must be defined per feature.

---

## 58. Failure Isolation

One service failure should not unnecessarily bring down the entire platform.

Example:

Search Service DOWN
    ↓
Messaging still works

Notification Service DOWN
    ↓
Message persistence still works

Analytics Service DOWN
    ↓
Core chat still works

Asynchronous architecture should be used to isolate non-critical workloads.

---

## 59. Rate Limiting

Rate limiting should exist at multiple levels where required.

Possible levels:

- IP
- User
- API Endpoint
- Authentication Attempt
- WebSocket Connection
- Message Sending
- Media Upload
- Search

Redis can be used for distributed rate limiting.

Particularly protect:

- Login
- Registration
- Password Reset
- OTP / Verification
- Message Sending
- Media Upload
- Search

---

## 60. Security Boundary

Security must exist at multiple layers.

Internet
    ↓
Load Balancer
    ↓
API Gateway
    ↓
Authentication
    ↓
Authorization
    ↓
Microservice
    ↓
Database

Internal services must not blindly trust every request.

Service-to-service authentication and authorization should be considered for production deployment.

---

## 61. API Versioning

Public APIs should support versioning.

Example:

/api/v1/users
/api/v1/conversations
/api/v1/messages

Breaking API changes should use a new version rather than silently changing the existing contract.

---

## 62. Configuration

Configuration should come from environment/configuration management.

Examples:

- DATABASE_URL
- REDIS_URL
- KAFKA_BROKERS
- JWT configuration
- Object storage configuration
- Email provider configuration

Secrets must not be committed to Git.

Configuration should be validated during application startup.

Invalid configuration should cause the service to fail fast.

---

## 63. Health Checks

Each service should expose health information.

Conceptual endpoints:

GET /health
GET /ready

Health should distinguish between:

Liveness:
Is the process alive?

Readiness:
Can this instance safely receive traffic?

---

## 64. Graceful Shutdown

Services should handle shutdown signals.

Flow:

Shutdown Signal
    ↓
Stop accepting new traffic
    ↓
Finish active work
    ↓
Close Kafka consumers/producers
    ↓
Close Redis connections
    ↓
Close Database connections
    ↓
Exit

This reduces dropped requests and inconsistent processing.

---

## 65. Testing Strategy

Each service should have multiple test levels.

### Unit Tests

Test:

- Domain logic
- Application services
- Validation
- Business rules
- Utility functions

External dependencies should normally be mocked.

### Integration Tests

Test:

- Database repositories
- Redis integrations
- Kafka integrations where practical
- Service modules

### End-to-End Tests

Test complete flows such as:

- Registration
- Login
- Refresh token
- Password reset
- Conversation creation
- Message sending
- Message retrieval
- Message read
- Group operations

### Regression Tests

Every production bug should result in an appropriate regression test where practical.

---

## 66. Database Testing

Repository tests should verify:

- Inserts
- Updates
- Deletes
- Constraints
- Transactions
- Unique indexes
- Foreign keys
- Pagination
- Concurrency behavior where applicable

Tests should use isolated test data.

Production databases must never be used for automated tests.

---

## 67. Kafka Testing

Kafka consumers/producers should be tested for:

- Correct topic
- Correct event payload
- Event version
- Successful processing
- Duplicate events
- Retry behavior
- DLQ behavior
- Invalid payloads

Consumers should be safe to execute more than once.

---

## 68. API Testing

API tests should verify:

- Authentication
- Authorization
- Validation
- HTTP status codes
- Response structure
- Error structure
- Pagination
- Rate limiting
- Idempotency

Swagger/OpenAPI should document the public APIs.

---

## 69. Security Testing

Security testing should cover:

- Authentication bypass
- Authorization bypass
- Invalid tokens
- Expired tokens
- Refresh token reuse
- Brute-force attempts
- Rate limiting
- Input validation
- Injection attacks
- Sensitive data exposure
- Improper error exposure
- File upload abuse
- CORS configuration
- Security headers

---

## 70. Clean Architecture Rules

The project should use pragmatic Clean Architecture principles.

Core rule:

Business logic should not depend heavily on infrastructure.

Dependency direction should generally be:

Controller
    ↓
Application
    ↓
Domain

Infrastructure implements interfaces required by the application/domain.

Do not create abstractions without a real reason.

Avoid unnecessary layers and interfaces.

The goal is maintainability, not architectural complexity.

---

## 71. SOLID Principles

The implementation should follow SOLID where appropriate.

### Single Responsibility

A class/module should have one clear responsibility.

### Open/Closed

Prefer extending behavior without modifying stable code unnecessarily.

### Liskov Substitution

Implementations should respect the contracts they implement.

### Interface Segregation

Prefer focused interfaces over large interfaces.

### Dependency Inversion

High-level business logic should not depend directly on infrastructure implementations.

SOLID should be applied pragmatically.

---

## 72. DRY Principle

Do not duplicate business logic unnecessarily.

Shared code should be extracted only when:

- The behavior is genuinely common.
- The abstraction is stable.
- The abstraction reduces duplication without creating unnecessary coupling.

Do not create a giant shared utility package containing unrelated business logic.

---

## 73. KISS Principle

Prefer simple designs.

Avoid:

- Unnecessary abstractions
- Over-engineered patterns
- Premature optimization
- Distributed transactions
- Excessive service-to-service calls
- Complex infrastructure without a real requirement

Complexity must have a reason.

---

## 74. Composition Over Inheritance

Prefer composition for application behavior.

Use inheritance only when there is a strong domain or framework reason.

Favor:

Dependency Injection
+
Small Components
+
Explicit Composition

over deep inheritance hierarchies.

---

## 75. API Gateway Responsibility Boundary

The API Gateway should NOT become a second monolith.

Gateway responsibilities:

- Routing
- Authentication verification
- Rate limiting
- Request metadata
- Basic security controls
- API versioning
- Request/response infrastructure concerns

The Gateway should NOT contain:

- Chat business rules
- Message business rules
- User business rules
- Notification business rules
- Database business logic

---

## 76. Service-to-Service Calls

Before creating a synchronous service-to-service dependency, ask:

1. Is the information required immediately?
2. Can the operation be asynchronous?
3. What happens if the dependency is unavailable?
4. What timeout is acceptable?
5. Should the call be retried?
6. Can the dependency create a cascading failure?

Prefer asynchronous communication for non-critical downstream work.

---

## 77. Distributed Workflow Principle

A workflow crossing multiple services should not rely on a single distributed transaction.

Example:

Create user
    ↓
UserCreated event
    ↓
Notification Service
    ↓
Send welcome email

If notification fails:

User creation should still remain successful.

The notification system retries independently.

---

## 78. Outbox Consideration

When an operation requires both:

1. Database persistence
2. Event publishing

the system should consider the transactional outbox pattern.

Conceptual flow:

BEGIN TRANSACTION

Write business data
Write event to outbox

COMMIT

Outbox Worker
    ↓
Kafka
    ↓
Consumers

This prevents a situation where database persistence succeeds but event publishing fails permanently.

The exact outbox implementation will be finalized during the Event-Driven Architecture phase.

---

## 79. Message Ordering

Message ordering should be preserved where required.

Messages belonging to the same conversation should use a consistent Kafka partitioning strategy.

Conceptually:

Conversation ID
    ↓
Kafka Partition Key
    ↓
Ordered processing within partition

Do not assume global ordering across the entire Kafka cluster.

Only define ordering guarantees where the product requires them.

---

## 80. Duplicate Event Handling

Distributed systems may produce duplicate processing attempts.

Consumers must use idempotency.

Examples:

MessageCreated processed twice
    ↓
Do not create two notifications

UserCreated processed twice
    ↓
Do not create duplicate derived records

MediaUploaded processed twice
    ↓
Do not duplicate metadata/index entries

---

## 81. Backpressure

High traffic can overwhelm downstream systems.

The platform should use:

- Kafka buffering
- Consumer scaling
- Rate limiting
- Bounded concurrency
- Queue-based processing
- Database connection limits

Consumers should not process unlimited work concurrently.

---

## 82. Database Connection Management

Each service must use controlled database connection pooling.

Do not create a new database connection per request manually.

Connection pool size must account for:

- Number of service replicas
- Database maximum connections
- Query workload
- Background workers

At scale:

Total possible connections
=
Connection Pool Per Instance
×
Number of Instances

This must be planned carefully.

---

## 83. Caching Rules

Cache only data where caching provides measurable value.

Good candidates:

- Frequently requested user profiles
- Public/static configuration
- Frequently accessed conversation metadata
- Temporary session information
- Presence

Avoid caching data that changes extremely frequently unless invalidation is well understood.

Never cache sensitive information without an explicit security design.

---

## 84. Message History Performance

Message history is expected to be one of the largest datasets.

The system should:

- Partition or shard only when necessary
- Use proper indexes
- Use cursor pagination
- Avoid expensive joins on hot paths
- Avoid large OFFSET values
- Keep message queries predictable
- Monitor query performance

Database design in Phase 10 will define the exact indexes and schema.

---

## 85. Hot Data vs Cold Data

Frequently accessed data:

- Recent messages
- Active conversations
- Presence
- Current sessions

should be optimized for low latency.

Older or rarely accessed data may use different storage/retention strategies where necessary.

The platform should not assume every message must remain equally hot forever.

---

## 86. Audit Logging

Security-sensitive actions should generate audit records where required.

Examples:

- Login events
- Password changes
- Role changes
- Group administration actions
- Account suspension
- Administrative actions
- Security-sensitive configuration changes

Audit logs should be append-oriented and protected from unauthorized modification.

---

## 87. Soft Delete

Soft delete should be used only where business requirements justify it.

Possible examples:

- User account
- Conversation membership
- Certain user-generated content

Do not automatically use soft deletes for every table.

For data that must be permanently deleted, a hard-delete or data-erasure workflow may be required.

---

## 88. Data Privacy

The platform should minimize unnecessary personal data.

Sensitive data should:

- Be protected
- Have limited access
- Not appear in logs
- Have defined retention
- Be deleted when required
- Be transmitted securely

Privacy requirements should be considered during schema and API design.

---

## 89. File Upload Security

Media uploads must not trust client-provided metadata.

Validate:

- File size
- MIME type
- Extension
- Actual file format where necessary
- Storage authorization
- Upload ownership

Potentially unsafe files should be rejected or scanned.

Never execute uploaded files.

---

## 90. API Security

Public APIs should use:

- HTTPS
- Authentication
- Authorization
- Rate limiting
- Input validation
- Security headers
- Proper CORS configuration
- Secure cookies where applicable
- Token expiration
- Secure secret management

CSRF protection should be evaluated based on the authentication mechanism and browser interaction model.

---

## 91. Secrets Management

Secrets must not be stored in:

- Git
- Source code
- Docker images
- Logs
- Public configuration files

Production secrets should be supplied through secure environment/configuration mechanisms.

Examples:

- Database credentials
- JWT secrets/keys
- Kafka credentials
- Redis credentials
- Object storage credentials
- Email provider credentials

---

## 92. Service Startup

Recommended startup sequence:

Load Configuration
    ↓
Validate Configuration
    ↓
Initialize Application
    ↓
Initialize Database
    ↓
Initialize Redis/Kafka Clients
    ↓
Register Routes
    ↓
Start Server
    ↓
Become Ready

If required configuration is invalid, the service should fail fast.

---

## 93. Service Shutdown

Recommended shutdown sequence:

Receive Shutdown Signal
    ↓
Mark Instance Not Ready
    ↓
Stop New Requests
    ↓
Finish Active Requests
    ↓
Stop Background Processing
    ↓
Commit/Finish Required Kafka Work
    ↓
Close Kafka
    ↓
Close Redis
    ↓
Close Database
    ↓
Exit

---

## 94. Production Error Principle

Never hide errors silently.

Bad:

catch error
ignore error

Better:

catch error
log structured context
classify error
retry if appropriate
return safe response
or move event to DLQ

Errors should be observable and actionable.

---

## 95. Performance Principle

Performance optimization should be evidence-driven.

Do not optimize based only on assumptions.

Measure:

- API latency
- Database query latency
- Redis latency
- Kafka processing latency
- WebSocket delivery latency
- CPU
- Memory
- Network
- Consumer lag

Optimize actual bottlenecks.

---

## 96. Scalability Principle

Services should be designed to scale horizontally where practical.

Conceptual model:

Service Instance 1
Service Instance 2
Service Instance 3
Service Instance N

Traffic
    ↓
Load Balancer
    ↓
Service Instances

Stateless HTTP services should generally avoid storing important local state.

State should live in appropriate shared systems such as:

- PostgreSQL
- Redis
- Kafka
- Object Storage

---

## 97. Stateless Service Principle

Application service instances should be as stateless as practical.

Avoid storing important state only in process memory.

Bad:

User session stored only in local memory.

Better:

Session state stored in a shared durable/appropriate system.

This allows Kubernetes to freely scale or replace instances.

---

## 98. Realtime Scaling Principle

Realtime connections are stateful at the connection layer.

Therefore the architecture must support:

- Multiple realtime instances
- Connection registration
- User-to-instance mapping
- Distributed message routing
- Connection cleanup
- Heartbeats
- Failure recovery

Redis or another distributed mechanism may be used to coordinate connection state.

---

## 99. Database Scaling Principle

PostgreSQL should be optimized before introducing unnecessary complexity.

Start with:

- Proper schema
- Proper indexes
- Efficient queries
- Connection pooling
- Transactions
- Query monitoring

Later scaling options may include:

- Read replicas
- Partitioning
- Archiving
- Sharding

Do not introduce sharding before the workload requires it.

---

## 100. Low-Level Design Summary

The platform follows these core implementation principles:

1. Keep controllers thin.
2. Put use-case coordination in application services.
3. Keep business rules in the domain layer.
4. Abstract persistence through repositories.
5. Keep infrastructure concerns isolated.
6. Use dependency injection.
7. Keep transactions inside service boundaries.
8. Avoid distributed database transactions.
9. Use Kafka for asynchronous workflows.
10. Design Kafka consumers to be idempotent.
11. Use retries with bounded backoff.
12. Use DLQs for permanently failed events.
13. Use Redis for fast/temporary state.
14. Keep PostgreSQL as the source of truth for durable business data.
15. Use cursor pagination for large datasets.
16. Authenticate and authorize every protected operation.
17. Do not trust client-side authorization.
18. Use request IDs and correlation IDs.
19. Use structured logging.
20. Provide health checks, metrics, and tracing.
21. Design services for horizontal scaling.
22. Keep non-critical workloads isolated from core messaging.
23. Use graceful shutdown.
24. Test business logic, repositories, APIs, integrations, and end-to-end flows.
25. Prefer simple designs over unnecessary abstraction.
26. Optimize based on measurements.
27. Keep service ownership and database ownership explicit.
28. Consider the transactional outbox for reliable event publishing.
29. Treat duplicate events and retries as normal distributed-system behavior.
30. Design for failure, not only the happy path.

---

## 101. Phase 7 Completion Criteria

Phase 7 is complete when:

- The low-level architecture is documented.
- Service internal layering is defined.
- Controller/application/domain/repository responsibilities are defined.
- Authentication flow is defined.
- Message flow is defined.
- Realtime flow is defined.
- Presence flow is defined.
- Notification flow is defined.
- Media flow is defined.
- Search flow is defined.
- Transaction boundaries are defined.
- Idempotency strategy is defined.
- Retry and DLQ concepts are defined.
- Redis responsibilities are defined.
- Kafka responsibilities are defined.
- Error handling principles are defined.
- Authorization principles are defined.
- Observability principles are defined.
- Testing strategy is defined.
- Scalability principles are defined.
- Failure isolation principles are defined.

Detailed database schemas, exact Kafka topics, Redis key structures, service folder structures, infrastructure, Docker, Kubernetes, and CI/CD are intentionally deferred to later phases.

---

## 102. Next Phase

After Phase 7 is completed and approved, proceed to:

Phase 8 — Microservice Identification

Phase 8 will define the exact microservices, their responsibilities, ownership boundaries, dependencies, communication patterns, and why each service exists.