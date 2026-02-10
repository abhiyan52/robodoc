# RoboDoc Prototype MVP

Single guided workflow demo for RoboDoc. The goal is to show a structured, deployable workflow with photo capture, auto filing, and completeness checks.

## Features
- Guided checklist with required steps
- Photo upload per step
- Auto folder and filename logic
- Completeness summary
- Supabase Storage integration (no backend)

## Setup
1. Create a Supabase project and a Storage bucket (for example `robot-images`).
2. Copy the project URL and anon key into a local env file:

```
cp .env.example .env
```

3. Install and run:

```
npm install
npm run dev
```

## Supabase Env Vars
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_BUCKET` (optional; defaults to `robot-images`)

## Deployment
Deploy to Vercel and set the env vars above. The app is static and uses Supabase Storage directly.

## Folder Structure
Uploads go to:

```
robot-images/<robotType>/<serial>/<context>/<fileName>
```

Example filename:

```
2525_Incoming_Packaging_Left_001_2026-02-10T12-30-00-000Z.jpg
```
