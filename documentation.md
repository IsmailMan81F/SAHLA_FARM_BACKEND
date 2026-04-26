# SAHLA FARM BACKEND API Documentation

Base URL: `https://backend-server.com/api`


---

## Table of Contents

1. [Auth Endpoints](#auth-endpoints)
2. [Settings Endpoints](#settings-endpoints)
3. [Notifications Endpoints](#notifications-endpoints)
4. [History Endpoints](#history-endpoints)

---

## Auth Endpoints

### 1. POST /auth/signupSetup

Complete user profile setup after initial signup. Creates user preferences (units, language) and welcome notification.

**Endpoint:**
```
POST /api/auth/signupSetup
```

**Goal:** Finalize user profile by adding username, age, address, and initializing default preferences.

**When to use:** right after validated signup (after confirming the email and before redirecting to the login page)

**Request Format:**
```json
{
  "username": "JohnDoe",
  "email": "user@example.com",
  "age": 25,
  "address": "123 Farm Street, City"
}
```

**Bearer:** Required (Bearer access token from signup).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 201 | `User setup completed successfully`  | Success |
| 400 | `username, age, and address are required and age must be a number` | Missing or invalid fields |
| 400 | `User update failed` + error message | Database update error |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 500 | `Failed to complete signup setup` | Server error during preference creation |

---

### 2. POST /auth/loginSetup

Update last login timestamp and create login notification.

**Endpoint:**
```
POST /api/auth/loginSetup
```

**Goal:** Track user login activity and generate a login notification.

**When to use:** right after validated login (before redirecting to the home page)

**Request Format:**
```json
{
  // No body required if token is in Authorization header
}
```

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

### 1. GET /settings/profile

Retrieve user profile information including preferences and Home Assistant status.

**Endpoint:**
```
GET /api/settings/profile
```

**Goal:** Get complete user profile with display units, language preference, and HA connection status.

**When to use:** On each access to the settings page

**Request Format:** No body required.

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | Profile object with `id`, `username`, `email`, `age`, `address`, `avatarUrl`, `haUrl`, `haStatus`, `preferences` | Success |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `User profile not found` | User record doesn't exist in database |
| 500 | `Failed to load profile settings` | Server error during preference fetch |

## Example of success response : 
```code
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "3azouz",
  "email": "anesbenaziza19@gmail.com",
  "age": 24,
  "address": "Sidi Bel Abbes, Algeria",
  "avatarUrl": "https://images5.alphacoders.com/100/1005348.jpg",
  "haUrl": "http://sahla-homeassistant.local:8123",
  "preferences": {
    "displayUnits": {
      "temperature": "°C",
      "humidity": "%",
      "soilMoisture": "%",
      "luminosity": "lux"
    },
    "language": "English"
  }
}
```
> **Note:** The farm settings (crop, ..) will be manipulated with websocket later..
---

### 2. POST /settings/editUnit

Update a display unit preference (temperature, humidity, soil moisture, luminosity).

**Endpoint:**
```
POST /api/settings/editUnit
```

**Goal:** Change how sensor values are displayed to the user.

**When to use:** When clicking the choice in the unit selection

**Request Format:**
```json
{
  "name": "temperature",
  "unit": "°C"
}
```

Valid `name` values: `temperature`, `humidity`, `soil moisture`, `luminosity`


**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Unit preference updated successfully` | Success |
| 400 | `name and unit are required` | Missing fields |
| 400 | `Invalid unit name. Must be one of: temperature, humidity, soil moisture, luminosity` | Invalid unit name |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `Preference unit not found` | Unit preference doesn't exist for user |
| 500 | `Failed to update preference unit` | Database error |

---

### 3. POST /settings/editLanguage

Update user's preferred language.

**Endpoint:**
```
POST /api/settings/editLanguage
```

**Goal:** Change the language preference for the user interface.

**When to use:** When clicking the choice in the language selection

**Request Format:**
```json
{
  "language": "english"
}
```

Valid `language` values: `arabic`, `english`, `french`


**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Language preference updated successfully` | Success |
| 400 | `language is required` | Missing language field |
| 400 | `Invalid language. Must be one of: arabic, english, french` | Invalid language value |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `Language preference not found` | Language preference record missing |
| 500 | `Failed to update preference language` | Database error |

---

### 4. POST /settings/editProfile

Update user profile information (username, email, address, age) and optionally change password.

**Endpoint:**
```
POST /api/settings/editProfile
```

**Goal:** Update user profile details or change password.

**When to use:** When filling the edit profile form and clicking confirm

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

> **Note:** `currentPassword` and `newPassword` must both be provided together to change password. Password must be more than 8 characters. (If both are empty, the password changing is ignored)

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Profile updated successfully` | Success |
| 400 | `Both currentPassword and newPassword must be provided together or both empty` | Incomplete password change request |
| 400 | `New password must contain more than 8 characters` | Password too short |
| 401 | `Current password is incorrect` | Wrong current password provided |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 409 | `Email is already used` | Another user has this email |
| 409 | `Username is already used` | Another user has this username |
| 500 | `Failed to update user profile` | Database error |
| 500 | `Failed to update password` | Supabase auth error |

---

### 5. POST /settings/editAvatarUrl

Update user's avatar URL.

**Endpoint:**
```
POST /api/settings/editAvatarUrl
```

**Goal:** Change the user's profile picture.

**When to use:** When uploading the avatar image and clicking confirm

> **Note:** Notice here that the image saving must be in the frontend using the supabase.storage, in which, when storing the image there, you'll get a publicUrl to it, this will be stored in the backend using this endpoint.

**Request Format:**
```json
{
  "avatarUrl": "https://example.com/avatar.jpg"
}
```


**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Avatar updated successfully` | Success |
| 400 | `avatarUrl is required` | Missing avatarUrl field |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `User not found` | User record doesn't exist |
| 500 | `Failed to update avatar` | Database error |

---

### 5. POST /settings/editHaCredentials

Register or update Home Assistant credentials. Validates HA connection, creates/updates farm, and stores tokens.

**Endpoint:**
```
POST /api/settings/editHaCredentials
```

**Goal:** Connect user to their Home Assistant instance and link to a farm.

**When to use:** When editing the HA credentials

> **Note:** Only valid HA crendentials will be stored, in this case the reponse comes with "status=online" so you update it in the settings page, otherwise, the reponse comes with "status=offline"

**Request Format:**
```json
{
  "haUrl": "http://192.168.1.100:8123",
  "haToken": "your_home_assistant_long_lived_access_token"
}
```

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|-----------------|
| 200 | `Home Assistant credentials updated successfully` | Success |
| 400 | `haUrl and haToken are required` | Missing fields |
| 400 | `input_text.ha_instance_id helper not found. Please create it manually in Home Assistant` | HA helper entity missing |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 401 | `Invalid Home Assistant credentials` | Wrong HA token |
| 503 | `Home Assistant server is unreachable` | Cannot connect to HA URL |
| 500 | `Failed to edit HA credentials` | Database or server error |

> **Important:** Before using this endpoint, the user must create an `input_text.ha_instance_id` helper in their Home Assistant instance (Settings → Helpers → Add Helper → Text).

## Example of success response : 
```code
{
    status: "online",
    message: "Home Assistant credentials updated successfully"
}

another one :

{
    status: "offline",
    message: "haUrl and haToken are required"
}

```
---

## Notifications Endpoints

### 1. GET /notifications

Fetch user and farm notifications with a specified limit.

**Endpoint:**
```
GET /api/notifications?limit=x
```

**Goal:** Retrieve notifications for the logged-in user and their associated farm.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | yes | Maximum number of notifications to return  |


**Bearer:** Required (Bearer access token).

**When to use:** On each access to the notifications page

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

## Example of success response : 
```code
[
{
    id: 02188444-9e26-49de-b46f-9bf61daa285d,
    title: "Heat stress detected",
    description: "Apple Tomato field — temperature exceeded 38°C for over 2 hours.",
    timestamp: "2026-04-22 21:52:31.321+00",
    isRead: false
  },
  {
    id: 0c32c2b7-8c4e-4fa2-8385-f3ce2b443589,
    title: "New login to the account",
    description: "Someone login to your account at 22:52",
    timestamp: "2026-04-22 21:52:31.321+00",
    isRead: true
  },
  {
    id: 65685f17-2291-483b-8359-ce88988043f93,
    title: "Welcome to Sahla Farm !",
    description: "Welcome to Sahla Farm, your number One farm assistant app",
    timestamp: "2026-04-22 21:52:31.321+00",
    isRead: true
  }
]  
```
---

### 2. PUT /notifications/?status=

Update the status of a single notification.

**Endpoint:**
```
PUT /api/notifications/:id?status=x
```

**Goal:** Mark a specific notification as read or unread.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | Yes | Either `read` or `unread` |


**Bearer:** Required (Bearer access token).

**When to use:** Change the status of the notification (ex: when clicking, set it to status=read)

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

### 3. PUT /notifications/all?status=

Update the status of all notifications for the user.

**Endpoint:**
```
PUT /api/notifications/all?status=x
```

**Goal:** Mark all user notifications as read or unread in one action.

**When to use:** Change the status of all the notifications (set them all to read or unread)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | Yes | Either `read` or `unread` |


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
- Alternatively, the token can be passed as a query parameter: `?token=<access_token>`


---

## History Endpoints

### 1. GET /histories

Fetch paginated list of history records with crop and weather data.

**Endpoint:**
```
GET /api/histories?offset=x&limit=y
```

**Goal:** Retrieve a paginated list of all farm history records.

**When to use:** On each access to the history page to display past records

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `offset` | number | yes | Starting position for record retrieval (must be non-negative) |
| `limit` | number | yes | Maximum number of records to return (must be positive and ≤ 100) |

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|----------------|
| 200 | `history` array | Success |
| 400 | `offset must be a non-negative number` | Invalid or negative offset |
| 400 | `limit must be a positive number` | Invalid or non-positive limit |
| 400 | `limit cannot exceed 100` | Limit exceeds maximum allowed |
| 400 | `Home Assistant credentials not set. Please configure HA credentials first.` | User hasn't connected HA |
| 400 | `All Home Assistant tokens are expired. Please update your HA credentials.` | All HA tokens expired |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `Farm not found` | Farm record missing |
| 500 | `Failed to load history` | Server error during fetch |

## Example of success response :
```code
{
  "history": [
    {
      "id": "37d8098b-366d-4599-b9e4-497e99863f54",
      "timestamp": "2026-04-25T22:43:17.415+00:00",
      "crop": {
        "type": "Banana",
        "growth_stage": "germination"
      },
      "weather": {
        "state": "rainy"
      }
    },
    {
      "id": "36ec70d8-67f5-442d-80e0-39a5b51bd4e8",
      "timestamp": "2026-04-25T22:43:02.414+00:00",
      "crop": {
        "type": "Banana",
        "growth_stage": "germination"
      },
      "weather": {
        "state": "rainy"
      }
    }
  ]
}
```

---

### 2. GET /histories/:id

Fetch a specific history record by ID with all related data (crop, sensors, actuators, weather, recommendation).

**Endpoint:**
```
GET /api/histories/:id
```

**Goal:** Retrieve complete details of a specific history record including all associated data.

**When to use:** When clicking on a history record to view its full details

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | The history record ID (UUID format) |

**Bearer:** Required (Bearer access token).

**Possible Responses:**

| Status Code | Message | Possible Cause |
|-------------|---------|----------------|
| 200 | History object with all related data | Success |
| 400 | `History ID is required` | Missing ID in path |
| 400 | `Home Assistant credentials not set. Please configure HA credentials first.` | User hasn't connected HA |
| 400 | `All Home Assistant tokens are expired. Please update your HA credentials.` | All HA tokens expired |
| 401 | `Authorization token is required` | Missing token |
| 401 | `Invalid or expired token` | Token verification failed |
| 404 | `Farm not found` | Farm record missing |
| 404 | `History not found` | History record not found for given ID |
| 500 | `Failed to load history` | Server error during fetch |

## Example of success response :
```code
{
  "run": {
    "id": "4d468e89-4066-42dc-b4fa-c746f07c220a",
    "timestamp": "2026-04-25T22:40:17.367+00:00",
    "crop": {
      "type": "Banana",
      "mode": "balanced",
      "growth_stage": "germination"
    },
    "sensors": [
      {
        "id": "8726d9ed-a36d-4902-a615-7b25dfe07bf5",
        "type": "temperature",
        "unit": "°C",
        "value": 57,
        "description": "Temperature is comfortable, ideal for carrot seedling growth."
      },
      {
        "id": "b3fb7c99-f4ab-45c3-a5d9-4057bf1bf9e4",
        "type": "humidity",
        "unit": "%",
        "value": 41,
        "description": "Humidity is moderate, supporting healthy carrot seedling development."
      },
      {
        "id": "23276e8b-e896-4854-90ab-b50829bc83e5",
        "type": "soil moisture",
        "unit": "%",
        "value": 54,
        "description": "Your soil is critically dry; irrigate now to protect seedlings."
      },
      {
        "id": "df4caa46-9fa7-430b-ba77-a10b5e047b92",
        "type": "luminosity",
        "unit": "lux",
        "value": 516,
        "description": "Light levels are adequate, allowing seedlings to photosynthesize efficiently."
      }
    ],
    "actuators": [
      {
        "id": "44f3f537-1f51-4a9e-9129-8434d5073de5",
        "type": "pump",
        "status": "off",
        "control_mode": "auto",
        "run_at": "2026-04-07T18:31:00+00:00",
        "duration_minutes": 45,
        "run_until": "2026-04-07T19:16:00+00:00"
      },
      {
        "id": "76058efe-9f12-4129-89ef-c71ce6ec33b7",
        "type": "fan",
        "status": "on",
        "control_mode": "auto",
        "run_at": "2026-04-07T14:34:00+00:00",
        "duration_minutes": 45,
        "run_until": "2026-04-07T15:19:00+00:00"
      }
    ],
    "weather": {
      "state": "rainy",
      "summary": "The next 48 hours in Algiers will be marked by cloudy skies and high precipitation probabilities, starting with heavy rain showers and gradually decreasing to light rain. Temperatures will remain cool, peaking around 15°C"
    },
    "recommendation": "No actuators to run. Soil is dry yet rain is forecasted heavily; image shows a dry scene. Keep irrigation off until weather clears, then consider watering."
  }
}
```

---

### Error Handling

- Always check the `status code` and `error` field in the response
- 4xx errors indicate client-side issues (missing fields, invalid values, unauthorized)
- 5xx errors indicate server-side issues

### Home Assistant Requirements

- To use notification ( and even history and dashboard ) endpoints, users must first connect Home Assistant via `/settings/editHaCredentials`
- The HA instance must have an `input_text.ha_instance_id` helper created manually