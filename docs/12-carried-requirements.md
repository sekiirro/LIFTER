# Carried requirements

Requirements decided before their target feature is specified or built. The target feature specification must carry each requirement into its functional requirements.

| ID | Requirement | Source | Target feature | Dependencies | Open technical item |
|---|---|---|---|---|---|
| REQ-P2-01 | PO, WO, or an authorized Trainer selects the intake form; it is automatically assigned after client approval and presented to the client on login. Preserve mandatory Basic/Workout/Nutrition intake and workspace authorization. Deliver this through the Forms/Intake engine (P2), not as a partial engine inside F12. | DG-F12-1, PO decision 2026-10-28 | P2 Forms/Intake spec (must be copied into that spec's FRs when specified) | F12 approval event; P2 form templates and assignment | Which existing capability authorizes Trainer form selection (for example, `coaching_work`), or whether a capability-matrix change is needed; decide in the P2 spec. |
