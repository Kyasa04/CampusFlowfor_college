# CampusFlow SOA Architecture

## Working path in this package

KL University ERP
-> CampusFlow browser extension
-> Complaint Service
-> H2 database

The extension calls:
- POST /api/complaints
- GET /api/complaints
- GET /api/complaints/{id}
- PATCH /api/complaints/{id}/status
- GET /api/complaints/stats
- GET /api/health

## Complaint lifecycle

Submitted -> In Progress -> Resolved

## SOA concepts represented

- Service boundary: Complaint Service
- Service contract: REST JSON API
- Endpoint: /api/complaints/*
- Persistence: JPA + H2
- Security configuration: Spring Security + CORS
- Testing: Spring Boot context test
- Health monitoring: Actuator

## Planned extension points

For the later syllabus stages, the project can be split into:
Auth Service, Notification Service, Department Service, Technician Service, Eureka Service Discovery, Spring Cloud Gateway, Kafka event bus, JWT authentication, Docker and cloud deployment.

Those are documented extension points; they are not falsely presented as already running in this simple working package.
