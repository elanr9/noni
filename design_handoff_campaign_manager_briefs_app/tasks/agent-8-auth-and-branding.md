# Agent 8: Auth screen + branding

Reference: reference_ui/AuthScreens.jsx.txt, assets/. Touch: app/(auth)/ or app/(onboarding)/ entry screen, assets/, app.json.

## Welcome screen spec
- White screen; decorative blue-50 circle (420px) bleeding off the top-left.
- Centered stack: rocket logo 150px (assets/noni-logo.svg), "Welcome to Noni!" (800 17px, SF Pro Rounded, blue-600), "UGC Made Easy" (800 40px, tracking -1.2, ink), "Sign in with the Google account your invite was sent to." (15px slate-500, max width 280).
- Bottom: Continue with Google button: full width, 52px, pill, white, 1.5px line-strong border, official multicolor Google G (19px), "Continue with Google" 700 16px ink. Wire to the existing Google auth flow.

## Branding
- Replace the app logo everywhere with assets/noni-logo.svg (solid blue-300 rocket pointing top right, white window cutout). Do not recolor or restroke.
- App icon: assets/app-icon-1024.png into the AppIcon asset (single 1024 size). Square, white background, no alpha; Apple applies the mask. Update app.json icon fields (iOS + Android foreground on white).

## Acceptance
- Screen matches reference at iPhone sizes; Google flow works; icon shows correctly on device home screen.
