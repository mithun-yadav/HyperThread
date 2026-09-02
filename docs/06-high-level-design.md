# Live Chat Platform — High-Level Design

## 1. Purpose

Define the overall architecture of the Live Chat Platform.

This document describes:

- Major system components
- Service communication
- Data flow
- External dependencies
- Scalability approach
- Reliability approach

Low-level implementation details are handled later.

---

# 2. High-Level Architecture

```text
                         ┌──────────────────┐
                         │   Web / Mobile   │
                         │     Clients      │
                         └────────┬─────────┘
                                  │
                           HTTPS / WebSocket
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   API Gateway    │
                         └────────┬─────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
             ▼                    ▼                    ▼
       Auth Service         User Service         Chat Service
             │                    │                    │
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  Message Service │
                         └────────┬─────────┘
                                  │
                     ┌────────────┴────────────┐
                     │                         │
                     ▼                         ▼
              ┌──────────────┐          ┌──────────────┐
              │  PostgreSQL  │          │    Kafka     │
              └──────────────┘          └──────┬───────┘
                                               │
                     ┌─────────────────────────┼────────────────────┐
                     │                         │                    │
                     ▼                         ▼                    ▼
              Presence Service        Notification Service   Analytics Service
                     │                         │                    │
                     ▼                         ▼                    ▼
                   Redis                External Providers      Analytics Store

                     ┌──────────────────────────────────────┐
                     │              Other Services           │
                     │                                      │
                     │ Media │ Search │ Admin │ etc.         │
                     └──────────────────────────────────────┘
