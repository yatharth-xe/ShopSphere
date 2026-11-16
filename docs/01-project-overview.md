# Project Overview

## Purpose

ShopSphere is a Software Engineering course project: a multi-vendor e-commerce application in which customers shop from several seller stores, while administrators moderate users, stores, products, and categories. The repository demonstrates a React single-page application, an Express REST API, MongoDB/Mongoose data modelling, role-based access control, validation, and automated backend tests.

## Objectives represented in the codebase

| Objective | Current evidence |
|---|---|
| Multi-vendor commerce | A product belongs to a store; checkout groups cart items into store-specific suborders. |
| Role-based workflows | Customer, seller, admin, support, and delivery roles are represented in user data and protected routes. |
| Security baseline | JWT access/refresh tokens, password hashing, request validation, auth rate limiting, staff provisioning controls, and support-ticket ownership checks. |
| Inventory reliability work | Product variants have stock/reserved stock invariants; Stage 3 adds an inventory-effect ledger, service, and safe seller stock updates. |
| Quality assurance | Node test/Supertest tests run against an isolated in-memory MongoDB replica set. |

## Scope of the demonstrable product

Implemented UI/API areas include catalog browsing, customer accounts, cart and checkout requests, seller store/product management, admin moderation, support tickets, wishlist, reviews, returns, notifications, and dashboards. Availability in a particular deployment still depends on its database data and configuration.

Important distinction: the Stage 3 inventory service is implemented and tested, but checkout, order-transition, and return/refund routes have **not yet** been integrated with that service. The repository should not be described as having fully transactional checkout or full payment processing.

## Technology summary

| Layer | Technologies found in the repository |
|---|---|
| Frontend | React 18, React Router, Vite, Tailwind CSS, Axios, Lucide React |
| Backend | Node.js, Express 5, Mongoose 9, MongoDB |
| Validation/security | Zod, JSON Web Token, bcrypt, express-rate-limit, cookie-parser, CORS |
| Testing | node:test, Supertest, mongodb-memory-server replica set |
| Optional AI integrations | Groq chat completions and Google Gemini embeddings |

See [Architecture and folder structure](02-architecture-and-folder-structure.md) and [Known limitations](08-known-limitations-and-future-work.md) for the boundaries of the implementation.
