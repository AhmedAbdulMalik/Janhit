# Skill: Automated Production Micro-Commit & Version Staging Engine
When the user executes `/gitskill`, analyze the local repository changes, staging arrays, or directory logs. Output instant terminal execution commands to maintain a secure version control history.

## 1. COMPACT CHANGELOG SYNTHESIS
- **Semantic Commit Structuring**: Analyze the exact lines modified to generate clear commit strings following the conventional commits specification:
  - `feat:` for complete incremental feature implementations.
  - `fix:` for type patches, logic fixes, or structural corrections.
  - `refactor:` for performance cleanups using `/refactor-fast`.
  - `chore:` for package dependency tracking updates or settings overrides.
- **Fluff Elimination**: Keep commit text sentences under 10 words. Focus strictly on architectural changes. Never include general descriptions like "fixed code" or "updated files".

## 2. REPOSITORY INTEGRITY CHECKING
- **Secret Spill Protection**: Intercept and block actions immediately if cleartext tokens, absolute workspace parameters, or `.env` credential strings are detected inside active file patches.
- **Context Synchronization**: Automatically generate a matching markdown bullet tracking entry to update `projectcontext.md` so code assistants stay aligned with current milestones.

## 3. INSTANT TERMINAL EXECUTION DELIVERY
- Output a single, terminal-ready code block that stages the targeted files, updates the status file, and executes the git commit string instantly:
  ```bash
  git add [absolute_file_paths] && git commit -m "[conventional_tag]: [concise_impact_statement]"
  ```
  