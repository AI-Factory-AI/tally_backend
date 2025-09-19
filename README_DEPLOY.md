# Tally Backend – Deploy to Render

## 1) Configure environment

Copy `example.env` to `.env` locally (do not commit `.env`). On Render, set these under Environment:

Required:
- MONGO_URI
- JWT_SECRET
- VOTER_JWT_SECRET
- VOTER_KEY_ENCRYPTION_KEY
- RPC_URL (default set in blueprint)
- CHAIN_ID (default set in blueprint)
- CREATOR_PRIVATE_KEY

Optional (email):
- RESEND_API_KEY and RESEND_FROM
- or FROM_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

Other:
- FRONTEND_URL (CORS and link generation)

## 2) Deploy

Option A: Use the repository blueprint at `render.yaml` (recommended)
- In Render, New + Blueprint, point to this repository
- Review envVars, set secrets
- Deploy

Option B: Manual Web Service
- Root directory: `tally_backend`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/health`

## 3) After deploy
- Verify logs show "MongoDB connected successfully"
- Hit `/health` to confirm OK
- Test auth and election flows

## Notes
- No secrets are hardcoded; all required keys must be provided via env.
- Chain defaults use Lisk Sepolia. Override via RPC_URL/CHAIN_ID as needed.
