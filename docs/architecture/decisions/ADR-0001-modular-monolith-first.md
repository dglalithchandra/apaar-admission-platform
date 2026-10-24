# ADR-0001: Start with a modular monolith

Status: accepted for initial delivery

## Decision

Build one Spring Boot deployable with strict modules and one PostgreSQL cluster. Keep contracts and ownership boundaries that permit later extraction.

## Why

Seat allocation, admission state and capacity checks need strong transactional consistency. Early microservices would add distributed failure modes before scale or team boundaries are known. Kafka, Temporal and OpenSearch remain planned integrations, introduced when a demonstrated workflow or load requires them.

## Consequences

Module dependencies are tested and enforced. Cross-module access goes through application interfaces. The deployment can scale horizontally, but a distributed architecture is not treated as proof of seriousness.
