# SAHLA_FARM_BACKEND

## ENDPOINTS :

### AUTHENTICATION :
```code
POST /api/auth/loginSetup
POST /api/auth/signupSetup
```
### SETTINGS :
```code
GET /api/settings/profile
POST /api/settings/editProfile
POST /api/settings/editUnit
POST /api/settings/editLanguage
POST /api/settings/editHaCredentials
```
### NOTIFICATIONS :
```code
GET /api/notifications?limit=x
POST /api/notifications/:id?status=y
POST /api/notifications/all?status=y
```

### HISTORIES :
```code
GET /api/histories?offset=x&limit=y
GET /api/histories/:id
```

### HOW TO USE : 

Install dependencies :
```code
npm install
```

Run the server :
```code
npm run dev
```
