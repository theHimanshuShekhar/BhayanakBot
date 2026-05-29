# Use Real Ollama For Personality E2E Tests When Relevant

Personality profile generation will use deterministic integration tests for default verification and real-Ollama e2e tests when changes affect prompts, Ollama integration, or profile-generation behavior. Real model tests catch failures that fake model boundaries cannot, but they are slower and environment-dependent, so unrelated changes may keep them opt-in. These tests should assert observable behavior and profile structure rather than exact generated prose.
