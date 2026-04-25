# Test Credentials

## POS Login PINs
- Admin: `11338585` (currently `is_super_admin: true` in DB — can toggle Feature Flags in Configuración → Plan)
- OSCAR (Cajero): `1111`
- Carlos (Mesero): `100`

## Super Admin (Feature Flags access)
Only users with `is_super_admin: true` in the `users` collection can:
- See the "Plan" tab in Configuración
- Call `PUT /api/features` to toggle premium features

To elevate a user to super_admin (run in MongoDB):
```
db.users.updateOne({id: "<user_id>"}, {$set: {is_super_admin: true}})
```

To demote:
```
db.users.updateOne({id: "<user_id>"}, {$set: {is_super_admin: false}})
```

## The Factory HKA (Sandbox)
- TokenUsuario: `xfsbrucwcqtr_tfhka`
- TokenPassword: `oA4$y/cm4gg,`
- RNC: `130178984`
- Company: PORTERHOUSE SRL
- Sandbox URL: `https://demoemision.thefactoryhka.com.do`
- Current active provider: `thefactory`

## Alanube (Sandbox)
- Token configured in backend/.env as ALANUBE_SANDBOX_TOKEN
- RNC: `132109122`
- Sandbox URL: `https://sand-api.alanube.co`
