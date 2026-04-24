# SAHLA FARM BACKEND API Documentation

Base URL: `https://your-api-domain.com/api`

> **Note:** All endpoints (except `/login` and `/signup`) require a Bearer access token for authentication.

---

## Table of Contents

1. [Auth Endpoints](#auth-endpoints)
2. [Settings Endpoints](#settings-endpoints)
3. [Notifications Endpoints](#notifications-endpoints)

---

## Auth Endpoints

### 1. POST /auth/login

Login with email and password to obtain an access token.

**Endpoint:**
```
POST /api/auth/login
```

**Goal:** Authenticate user and return access token for subsequent requests.

**Request Format:**
```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Bearer:** Not required for this endpoint.

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Login successful` + `token` + `user_id` | Success |
| 400 | `Email and password are required` | Missing email or password fields |
| 401 | `Invalid email or password` | Wrong credentials or user doesn't exist |
| 500 | `Login failed` | Server error or Supabase unavailable |

---

### 2. POST /auth/signup

Register a new user account.

**Endpoint:**
```
POST /api/auth/signup
```

**Goal:** Create a new user account in the system.

**Request Format:**
```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Bearer:** Not required for this endpoint.

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 201 | `User created successfully` + `user_id` + `token` | Success |
| 400 | `Email and password are required` | Missing email or password fields |
| 400 | `Signup failed` + error message | Email already exists or invalid password |
| 500 | `Signup failed` | Server error |

---

### 3. POST /auth/signupSetup

Complete user profile setup after initial signup. Creates user preferences (units, language) and welcome notification.

**Endpoint:**
```
POST /api/auth/signupSetup
```

**Goal:** Finalize user profile by adding username, age, address, and initializing default preferences.

**Request Format:**
```json
{
  "username": "JohnDoe",
  "email": "user@example.com",
  "age": 25,
  "address": "123 Farm Street, City"
}
```

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token from signup).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 201 | `User setup completed successfully` + `user` object | Success |
| 400 | `username, age, and address are required and age must be a number` | Missing or invalid fields |
| 400 | `User update failed` + error message | Database update error |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 500 | `Failed to complete signup setup` | Server error during preference creation |

---

### 4. POST /auth/loginSetup

Update last login timestamp and create login notification.

**Endpoint:**
```
POST /api/auth/loginSetup
```

**Goal:** Track user login activity and generate a login notification.

**Request Format:**
```json
{
  // No body required if token is in Authorization header
}
```

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Login setup completed successfully` | Success |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 400 | `Failed to update login timestamp` + error message | Database error |
| 500 | `Failed to complete login setup` | Server error |

---

## Settings Endpoints

### 5. GET /settings/profile

Retrieve user profile information including preferences and Home Assistant status.

**Endpoint:**
```
GET /api/settings/profile?token=<access_token>
```

**Goal:** Get complete user profile with display units, language preference, and HA connection status.

**Request Format:** No body required.

> **Note:** The `token` can be sent in the Authorization header (Bearer) or as a query parameter.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | Profile object with `id`, `username`, `email`, `age`, `address`, `avatarUrl`, `haUrl`, `haStatus`, `preferences` | Success |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `User profile not found` | User record doesn't exist in database |
| 500 | `Failed to load profile settings` | Server error during preference fetch |

---

### 6. POST /settings/editUnit

Update a display unit preference (temperature, humidity, soil moisture, luminosity).

**Endpoint:**
```
POST /api/settings/editUnit
```

**Goal:** Change how sensor values are displayed to the user.

**Request Format:**
```json
{
  "name": "temperature",
  "unit": "°C"
}
```

Valid `name` values: `temperature`, `humidity`, `soil moisture`, `luminosity`

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Unit preference updated successfully` + `data` | Success |
| 400 | `name and unit are required` | Missing fields |
| 400 | `Invalid unit name. Must be one of: temperature, humidity, soil moisture, luminosity` | Invalid unit name |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `Preference unit not found` | Unit preference doesn't exist for user |
| 500 | `Failed to update preference unit` | Database error |

---

### 7. POST /settings/editLanguage

Update user's preferred language.

**Endpoint:**
```
POST /api/settings/editLanguage
```

**Goal:** Change the language preference for the user interface.

**Request Format:**
```json
{
  "language": "english"
}
```

Valid `language` values: `arabic`, `english`, `french`

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Language preference updated successfully` + `data` | Success |
| 400 | `language is required` | Missing language field |
| 400 | `Invalid language. Must be one of: arabic, english, french` | Invalid language value |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `Language preference not found` | Language preference record missing |
| 500 | `Failed to update preference language` | Database error |

---

### 8. POST /settings/editProfile

Update user profile information (username, email, address, age) and optionally change password.

**Endpoint:**
```
POST /api/settings/editProfile
```

**Goal:** Update user profile details or change password.

**Request Format:**
```json
{
  "username": "NewUsername",
  "email": "newemail@example.com",
  "address": "New Address",
  "age": 30,
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

> **Note:** `currentPassword` and `newPassword` must both be provided together to change password. Password must be more than 6 characters.

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Profile updated successfully` + `user` object | Success |
| 400 | `Both currentPassword and newPassword must be provided together or both empty` | Incomplete password change request |
| 400 | `New password must contain more than 6 characters` | Password too short |
| 401 | `Current password is incorrect` | Wrong current password provided |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 409 | `Email is already used` | Another user has this email |
| 409 | `Username is already used` | Another user has this username |
| 500 | `Failed to update user profile` | Database error |
| 500 | `Failed to update password` | Supabase auth error |

---

### 9. POST /settings/editAvatarUrl

Update user's avatar URL.

**Endpoint:**
```
POST /api/settings/editAvatarUrl
```

**Goal:** Change the user's profile picture.

**Request Format:**
```json
{
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Avatar updated successfully` + `data` | Success |
| 400 | `avatarUrl is required` | Missing avatarUrl field |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `User not found` | User record doesn't exist |
| 500 | `Failed to update avatar` | Database error |

---

### 10. POST /settings/editHaCredentials

Register or update Home Assistant credentials. Validates HA connection, creates/updates farm, and stores tokens.

**Endpoint:**
```
POST /api/settings/editHaCredentials
```

**Goal:** Connect user to their Home Assistant instance and link to a farm.

**Request Format:**
```json
{
  "haUrl": "http://192.168.1.100:8123",
  "haToken": "your_home_assistant_long_lived_access_token"
}
```

> **Note:** The `token` can be sent in the Authorization header (Bearer) or in the request body as `token`.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Home Assistant credentials updated successfully` + `data` (farm_id, ha_instance_id) | Success |
| 400 | `haUrl and haToken are required` | Missing fields |
| 400 | `input_text.ha_instance_id helper not found. Please create it manually in Home Assistant` | HA helper entity missing |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 401 | `Invalid Home Assistant credentials` | Wrong HA token |
| 503 | `Home Assistant server is unreachable` | Cannot connect to HA URL |
| 500 | `Failed to edit HA credentials` | Database or server error |

> **Important:** Before using this endpoint, the user must create an `input_text.ha_instance_id` helper in their Home Assistant instance (Settings → Helpers → Add Helper → Text).

---

## Notifications Endpoints

### 11. GET /notifications

Fetch user and farm notifications with a specified limit.

**Endpoint:**
```
GET /api/notifications?limit=10&token=<access_token>
```

**Goal:** Retrieve notifications for the logged-in user and their associated farm.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum number of notifications to return (default: 10, max: 2 for user notifications) |
| `token` | string | No* | Access token (if not using Bearer header) |

> **Note:** The `token` can be sent in the Authorization header (Bearer) or as a query parameter.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `notifications` array | Success |
| 400 | `limit must be a positive number` | Invalid or missing limit |
| 400 | `Home Assistant credentials are not valid` | User hasn't connected HA yet |
| 400 | `Could not determine farm for current user` | No farm linked to user |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 500 | `Failed to load user notifications` | Database error (user notifications) |
| 500 | `Failed to load farm notifications` | Database error (farm notifications) |
| 500 | `Failed to load notifications` | General server error |

---

### 12. PUT /notifications/:id?status=

Update the status of a single notification.

**Endpoint:**
```
PUT /api/notifications/<notification_id>?status=read&token=<access_token>
```

**Goal:** Mark a specific notification as read or unread.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | Yes | Either `read` or `unread` |
| `token` | string | No* | Access token (if not using Bearer header) |

> **Note:** The `token` can be sent in the Authorization header (Bearer) or as a query parameter.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Notification marked as read` (or `unread`) | Success |
| 400 | `Notification ID is required` | Missing ID in path |
| 400 | `Status query parameter is required (read or unread)` | Missing status query param |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 400 | Error message from service | Notification not found or invalid status |
| 500 | `Failed to update notification status` | Server error |

---

### 13. PUT /notifications/all?status=

Update the status of all notifications for the user.

**Endpoint:**
```
PUT /api/notifications/all?status=read&token=<access_token>
```

**Goal:** Mark all user notifications as read or unread in one action.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | Yes | Either `read` or `unread` |
| `token` | string | No* | Access token (if not using Bearer header) |

> **Note:** The `token` can be sent in the Authorization header (Bearer) or as a query parameter.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `All notifications marked as read` (or `unread`) | Success |
| 400 | `Status query parameter is required (read or unread)` | Missing status query param |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 400 | Error message from service | Invalid status value |
| 500 | `Failed to update notification statuses` | Server error |

---

## General Notes

### Authentication

- Most endpoints require a Bearer token in the Authorization header: `Authorization: Bearer <access_token>`
- Alternatively, the token can be passed:
  - As a query parameter: `?token=<access_token>`
  - In the request body: `{ "token": "..." }`

### Error Handling

- Always check the `status code` and `error` field in the response
- 4xx errors indicate client-side issues (missing fields, invalid values, unauthorized)
- 5xx errors indicate server-side issues

### Home Assistant Requirements

- To use notification endpoints, users must first connect Home Assistant via `/settings/editHaCredentials`
- The HA instance must have an `input_text.ha_instance_id` helper created manually