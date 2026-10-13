# Screen map

Design project paths are relative to the Noni design system project. Routes are the `noni` Expo app unless marked web. Confirm each route in P0; create it if missing.

## Shared (P1, P2)
| Design | Source | Target |
|---|---|---|
| Tokens | styles.css, tokens/*.css | theme module (e.g. `components/ui/theme.ts`) |
| Primitives | components/, ui_kits/shared | `components/ui/*` |
| Company pill, switcher sheet, strip, notifications, tab dot | redesigns/multi-campaign (MCShared, MCCreator, MCManager) | `components/layout/*`, both tab layouts |

## Creator (P3, P6)
| Design | Source | Target |
|---|---|---|
| Today / home | ui_kits/creator-app TodayScreen, redesigns/multi-campaign MCCreator | app/(creator)/(tabs)/index |
| Task detail | ui_kits/creator-app TaskDetailScreen | app/(creator)/assignment/[id] |
| Record (teleprompter) | ui_kits/creator-app RecordScreen, briefs RLCreator | app/(creator)/record/[id] |
| Reel editor | briefs RLEditor | app/(creator)/studio |
| Slideshow: add your photos | briefs SSCreator (CreatorHandheld) | app/(creator)/post/[id] |
| Sent | briefs SSCreator (SentScreen) | app/(creator)/post/[id] success state |
| Posts, analytics, messages, profile | MCCreator, ui_kits/creator-app | app/(creator)/(tabs)/* |

## Campaign manager (P4, P5, P7)
| Design | Source | Target |
|---|---|---|
| Review queue + review | ui_kits/admin-app, MCManager ManagerReview | app/(admin)/(tabs)/index, app/(admin)/review/[id] |
| Briefs: week | briefs SSManager WeekScreen | app/(admin)/week-plan |
| Briefs: kind + post type | briefs SSManager KindScreen | app/(admin)/week-setup |
| Slideshow canvas (handheld, story) | briefs SSCanvas, SSFlow | app/(admin)/post/[id] |
| Reel script | briefs SSManager (format reel) | app/(admin)/post/[id] |
| Freestyle + AI hooks | briefs SSFreestyle | app/(admin)/post/[id] |
| Brief preview (FYP) | briefs SSFlow ReviewScreen | app/(admin)/post/[id] final step |
| Library | MCManager ManagerLibrary | app/(admin)/(tabs)/library |
| Messages | MCManager ManagerMessages | app/(admin)/messages |
| Analytics | MCManager ManagerAnalytics, campaign_manager bundle | app/(admin)/(tabs)/analytics |
| Settings | redesigns/admin/SettingsRedesign | app/(admin)/(tabs)/settings |

## Web (P8 to P10, noni-web)
| Design | Source | Target |
|---|---|---|
| Admin onboarding | design_handoff_admin_app_web (admin-onb-flow) | /onboarding |
| Admin home, setup tabs, Brand Brain, team, plan | admin-setup-app, admin-setup-tabs | /admin/* |
| Admin analytics | admin-analytics | /admin/analytics |
| Ops console | design_handoff_ops_console | /ops/* |
| Pricing | design_handoff_pricing_plans | /pricing |
| Landing | design_handoff_landing_page | / |
| Logo, app icon | design_handoff_logo | assets, app.json icons |
