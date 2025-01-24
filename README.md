# Twitter REST API for Frontend Developers

## Quick Start Guide

### Frontend Integration Patterns

#### 1. Tweet Creation Component
```javascript
async function createTweet(text, mediaFile) {
  const formData = new FormData();
  
  if (text) formData.append('text', text);
  if (mediaFile) formData.append('media', mediaFile);

  try {
    const response = await fetch('/tweet', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Handle successful tweet
      console.log('Tweet created:', result.tweet_id);
    }
  } catch (error) {
    // Handle network or API errors
    console.error('Tweet creation failed:', error);
  }
}

// Usage Examples
createTweet('Hello Twitter!'); // Text-only tweet
createTweet('Check out this image!', imageFile); // Tweet with media
```

### React Hook Example
```javascript
function TwitterPostComponent() {
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);

  const handleMediaUpload = (event) => {
    setMedia(event.target.files[0]);
  };

  const submitTweet = async () => {
    const formData = new FormData();
    formData.append('text', text);
    if (media) formData.append('media', media);

    try {
      const response = await fetch('/tweet', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      // Handle success/error
    } catch (error) {
      // Handle errors
    }
  };

  return (
    <div>
      <textarea 
        value={text} 
        onChange={(e) => setText(e.target.value)}
      />
      <input 
        type="file" 
        accept="image/*,video/*" 
        onChange={handleMediaUpload} 
      />
      <button onClick={submitTweet}>Tweet</button>
    </div>
  );
}
```

### Supported Media Types
- `image/jpeg`
- `image/png`
- `image/gif`
- `video/mp4`
- `video/quicktime`

### Error Handling Strategies
```javascript
async function createTweet(text, mediaFile) {
  try {
    const response = await fetch('/tweet', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    switch (response.status) {
      case 201: // Success
        // Tweet created
        break;
      case 400:
        // Validation error (no text, invalid media)
        console.error('Invalid tweet:', result.error);
        break;
      case 500:
        // Server-side error
        console.error('Server error:', result.error);
        break;
    }
  } catch (networkError) {
    // Network-level errors
    console.error('Network error:', networkError);
  }
}
```

### File Size and Type Validation
```javascript
function validateMediaFile(file) {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = [
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'video/mp4'
  ];

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported file type');
  }
}
```

### Security Best Practices
- Use HTTPS for all API calls
- Validate and sanitize input on both client and server
- Implement proper error boundaries
- Never expose API credentials on the client-side

### TypeScript Interfaces
```typescript
interface TweetResponse {
  success: boolean;
  tweet_id: string;
  text: string;
}

interface TweetError {
  error: string;
  details?: string;
}
```

### Performance Considerations
- Use `FormData` for efficient media uploads
- Implement loading states during API calls
- Consider lazy loading for media-heavy tweets
- Use debounce/throttle for tweet submission

### 1. Initiate Twitter Authentication
```javascript
// Redirect user to Twitter authentication
window.location.href = '/auth/twitter';
```

### 2. Handle Authentication Callback
- Automatically managed by backend
- Saves user-specific access tokens

## Tweet Creation

### Endpoint
`POST /tweet`

### Request Parameters
- `text` (optional): Tweet text
- `media` (optional): Media file
- `userId` (optional): Specific user account

### Media Support
Supported Types:
- JPEG
- PNG
- GIF
- MP4
- QuickTime Video

### Example Request (Vanilla JavaScript)
```javascript
const formData = new FormData();
formData.append('text', 'Hello Twitter!');
formData.append('media', fileInput.files[0]);
formData.append('userId', 'username');

fetch('/tweet', {
  method: 'POST',
  body: formData
});
```

### Example Request (React)
```javascript
const handleTweet = async () => {
  const formData = new FormData();
  formData.append('text', text);
  if (mediaFile) formData.append('media', mediaFile);

  try {
    const response = await fetch('/tweet', {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
  } catch (error) {
    // Handle error
  }
};
```

## Error Handling
- 400: Validation errors
- 500: Server-side errors

### Error Response Example
```json
{
  "error": "Unsupported media type",
  "supportedTypes": [
    "image/jpeg",
    "image/png"
  ]
}
```

## Best Practices
- Validate files client-side
- Handle large file uploads
- Manage loading/error states
- Secure token management