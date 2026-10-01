# PresenceX Backend Architecture

## Architecture Overview

```
                    Client Requests
                          │
                          ▼
                 ┌─────────────────┐
                 │  Engine Server  │
                 │  Load Balancer  │
                 │   (Port 5000)   │
                 │                 │
                 │  Round Robin    │
                 └────────┬────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ Server 1│  │ Server 2│  │ Server 3│
        │ Normal  │  │ Normal  │  │ Normal  │
        │5001     │  │5002     │  │5003     │
        └─────────┘  └─────────┘  └─────────┘
```

## Components

### Engine Server (Load Balancer)
- **Port**: 5000
- **File**: `engine-server.js`
- **Role**: 
  - Receives client requests
  - Forwards requests to normal servers using round-robin load balancing
  - Returns responses from normal servers to clients
  - Performs periodic health checks on all servers
  - Skips unhealthy servers and forwards to next healthy server

### Normal Servers
- **Ports**: 5001, 5002, 5003
- **File**: `normal-server.js`
- **Role**: 
  - Handle actual PresenceX operations
  - Provide `/health` endpoint for health checks
  - Handle presence-related API endpoints

## Load Balancing Strategy

### Round Robin
```
Request 1 → Server 1 (Port 5001)
Request 2 → Server 2 (Port 5002)
Request 3 → Server 3 (Port 5003)
Request 4 → Server 1 (Port 5001)
Request 5 → Server 2 (Port 5002)
...
```

Each request goes to the next server in sequence. If a server is unhealthy, it's skipped.

### Health Checks
- Runs every 5 seconds
- Checks `/health` endpoint on each server
- Marks server as unhealthy if:
  - No response within 2 seconds
  - Status code is not 200
  - Connection error occurs
- The engine server automatically skips unhealthy servers

## How to Run

### Prerequisites
All dependencies are already installed. If not, run:
```bash
npm install
```

### Running All Servers

Open **4 separate terminals** in the `server/` directory:

**Terminal 1 - Engine Server (Load Balancer)**
```bash
npm run engine
```
Output:
```
✓ Engine Server running on port 5000
✓ Load balancing between normal servers on ports: 5001, 5002, 5003
```

**Terminal 2 - Normal Server 1**
```bash
npm run server:1
```
Output:
```
✓ Normal Server running on port 5001
```

**Terminal 3 - Normal Server 2**
```bash
npm run server:2
```
Output:
```
✓ Normal Server running on port 5002
```

**Terminal 4 - Normal Server 3**
```bash
npm run server:3
```
Output:
```
✓ Normal Server running on port 5003
```

## API Endpoints

All endpoints are accessed through the **Engine Server** (port 5000):

### Health Check
```http
GET http://localhost:5000/health
```

### Get Presence Status
```http
GET http://localhost:5000/presence/status
```

### Update User Presence
```http
POST http://localhost:5000/presence/update
Content-Type: application/json

{
  "userId": "user123",
  "status": "online"
}
```

### Get Specific User Presence
```http
GET http://localhost:5000/presence/:userId
```

## Request Flow Example

1. **Client** sends a request to Engine Server (port 5000)
2. **Engine Server** performs health check on all servers
3. **Engine Server** selects next healthy server using round-robin (e.g., Server 1)
4. **Engine Server** forwards the request to Server 1 (port 5001)
5. **Server 1** processes the request and sends response back
6. **Engine Server** returns the response to the client
7. **Engine Server** increments round-robin index for next request

## Configuration

All settings are configurable via the `.env` file:

```
# Engine Server Configuration
ENGINE_PORT=5000

# Normal Servers Configuration
NORMAL_SERVER_1_PORT=5001
NORMAL_SERVER_2_PORT=5002
NORMAL_SERVER_3_PORT=5003

# Server Hostname (for health checks and requests)
SERVER_HOSTNAME=localhost

# Health Check Configuration
HEALTH_CHECK_PATH=/health
HEALTH_CHECK_TIMEOUT=2000          # milliseconds
HEALTH_CHECK_INTERVAL=5000         # milliseconds

# Request Timeout (for proxied requests)
REQUEST_TIMEOUT=10000              # milliseconds
```

To change any configuration, modify `.env` and restart the servers.

### Configuration Details

- **SERVER_HOSTNAME**: The hostname/IP used to connect to normal servers (default: localhost)
- **HEALTH_CHECK_PATH**: The endpoint path for health checks (default: /health)
- **HEALTH_CHECK_TIMEOUT**: Max time to wait for health check response (default: 2000ms)
- **HEALTH_CHECK_INTERVAL**: Frequency of health checks (default: 5000ms / 5 seconds)
- **REQUEST_TIMEOUT**: Max time to wait for proxied request response (default: 10000ms)

## Design Decisions

- **No Database**: For simple in-memory testing
- **No Redis/Message Queues**: Round-robin state is maintained in memory
- **No Docker/Kubernetes**: Simple Node.js process management
- **No Nginx**: Built-in load balancing with Express
- **Simple Health Checks**: Basic HTTP GET requests every 5 seconds
- **In-Memory Round-Robin Index**: Resets when engine restarts (acceptable for this architecture)

## Testing

### Using curl or HTTP Client
```bash
# Test through load balancer
curl http://localhost:5000/test

# Test direct server
curl http://localhost:5001/test
curl http://localhost:5002/test
curl http://localhost:5003/test

# Check health of all servers
curl http://localhost:5000/presence/status
```

### From Client App
The client can use the API service in `client/src/services/presenceAPI.js`:

```javascript
import { presenceAPI } from './services/presenceAPI.js';

// Get status
const status = await presenceAPI.getStatus();

// Update presence
await presenceAPI.updatePresence('user123', 'online');

// Get user presence
const userPresence = await presenceAPI.getUserPresence('user123');
```

## Monitoring

Watch the terminals to see:
- Health check logs (every 5 seconds)
- Request forwarding logs
- Server status
- Errors (if any)

## Troubleshooting

### "Port already in use" error
Kill the process using the port:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :5000
kill -9 <PID>
```

### "No healthy servers available" error
Check that all three normal servers are running in separate terminals.

### Engine server can't reach normal servers
Ensure all servers are started before making requests. The health check runs every 5 seconds.

## Next Steps

To extend this architecture:
1. Add database integration for persistence
2. Implement actual business logic in normal servers
3. Add authentication/authorization
4. Implement WebSocket support for real-time presence updates
5. Add logging/monitoring
