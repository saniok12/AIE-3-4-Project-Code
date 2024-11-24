// Initialize the map
const map = L.map('map').setView([55.4875, 8.4493], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

// Create a custom icon without a shadow
const noShadowIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

// Create a custom icon for Home
const homeIcon = L.icon({
    iconUrl: '/images/home.png', // Use the correct relative path
    iconSize: [30, 30],         // Adjust to your preferred size
    iconAnchor: [15, 30],       // Adjust to center the icon properly
    popupAnchor: [0, -30],      // Adjust popup position above the icon
});

// Variables to keep track of markers and state
let lastMarker = null;
let lastCircle = null;
let homeMarker = null;
let isSettingHome = false;
let radiusCircle = null; // To keep track of the radius circle
let alarmTriggered = false; // Flag to prevent multiple alarms

// Function to load home marker from localStorage
const loadHomeMarker = () => {
    const homeData = localStorage.getItem('homeMarker');
    if (homeData) {
        const { latitude, longitude } = JSON.parse(homeData);
        homeMarker = L.marker([latitude, longitude], { icon: homeIcon }).addTo(map)
            .bindPopup('Home').openPopup();
        map.setView([latitude, longitude], 13);

        // If radius is set, load and draw it
        const radius = localStorage.getItem('maxRadius');
        if (radius) {
            drawRadiusCircle(latitude, longitude, parseInt(radius, 10));
            document.getElementById('max-radius-display').innerText = `${radius} meters`;
        } else {
            document.getElementById('max-radius-display').innerText = 'Not Set';
        }

        // If downtime interval is set, load and display it
        const downtime = localStorage.getItem('downtimeInterval');
        if (downtime) {
            const { start, end } = JSON.parse(downtime);
            displayDowntimeInterval(start, end);
        } else {
            document.getElementById('downtime-interval').innerText = 'Not Set';
        }
    }
};

// Function to save home marker to localStorage
const saveHomeMarker = (lat, lng) => {
    const homeData = { latitude: lat, longitude: lng };
    localStorage.setItem('homeMarker', JSON.stringify(homeData));
};

// Function to draw radius circle
const drawRadiusCircle = (lat, lng, radius) => {
    // Remove existing circle if any
    if (radiusCircle) {
        map.removeLayer(radiusCircle);
    }

    // Draw new circle
    radiusCircle = L.circle([lat, lng], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.1,
        radius: radius // Radius in meters
    }).addTo(map);
};

// Function to display downtime interval on the sidebar
const displayDowntimeInterval = (start, end) => {
    const downtimeText = `${formatTime(start)} to ${formatTime(end)}`;
    document.getElementById('downtime-interval').innerText = downtimeText;
};

// Function to format time from 24-hour to 12-hour format with AM/PM
const formatTime = (timeStr) => {
    const [hour, minute] = timeStr.split(':').map(Number);
    const period = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = ((hour + 11) % 12 + 1); // Converts 0 to 12
    return `${formattedHour}:${minute.toString().padStart(2, '0')} ${period}`;
};

// Function to check if current time is within downtime interval
const isDowntimeActive = () => {
    const downtime = localStorage.getItem('downtimeInterval');
    if (!downtime) return false;

    const { start, end } = JSON.parse(downtime);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;

    if (startTotal < endTotal) {
        // Downtime does not span midnight
        return currentMinutes >= startTotal && currentMinutes < endTotal;
    } else {
        // Downtime spans midnight
        return currentMinutes >= startTotal || currentMinutes < endTotal;
    }
};

// Function to update alarm status indicator
const updateAlarmStatus = () => {
    const alarmStatusDiv = document.getElementById('alarm-status');
    const alarmStatusText = document.getElementById('alarm-status-text');

    if (isDowntimeActive()) {
        alarmStatusDiv.classList.remove('inactive');
        alarmStatusDiv.classList.add('active');
        alarmStatusText.innerText = 'Active';
    } else {
        alarmStatusDiv.classList.remove('active');
        alarmStatusDiv.classList.add('inactive');
        alarmStatusText.innerText = 'Inactive';
    }
};

// Load home marker on initialization
loadHomeMarker();

// Initial check for alarm status
updateAlarmStatus();

// Set interval to check alarm status every minute
setInterval(updateAlarmStatus, 60000); // 60000ms = 1 minute

// Function to play alarm sound
const playAlarmSound = () => {
    const alarmAudio = document.getElementById('alarm-audio');
    alarmAudio.currentTime = 0; // Reset to start
    alarmAudio.play().catch(error => {
        console.error('Error playing alarm sound:', error);
    });
};

// Function to check if current location is outside the radius
const isOutsideRadius = (lat, lng) => {
    const radius = localStorage.getItem('maxRadius');
    if (!radius || !homeMarker) return false;

    const homeLatLng = homeMarker.getLatLng();
    const distance = map.distance([lat, lng], homeLatLng); // Distance in meters

    return distance > parseInt(radius, 10);
};

// WebSocket connection for live updates
const socket = new WebSocket('ws://localhost:8080');
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Remove the last marker and circle, then add the new ones
    if (lastMarker) map.removeLayer(lastMarker);
    if (lastCircle) map.removeLayer(lastCircle);

    // Add a new marker for the latest GPS point
    lastMarker = L.marker([data.latitude, data.longitude], { icon: noShadowIcon }).addTo(map);

    // Display the formatted date and time from the backend
    lastMarker.bindPopup(`Date: ${data.date} <br> Time: ${data.time}`).openPopup();

    // Add a circle around the marker
    lastCircle = L.circle([data.latitude, data.longitude], {
        color: 'blue',
        fillColor: 'blue',
        fillOpacity: 0.3,
        radius: 20 // Radius in meters
    }).addTo(map);

    // Update the sidebar with the latest coordinates
    const coordList = document.getElementById('coordinates');
    const newItem = document.createElement('li');
    newItem.innerHTML = `Lat: ${data.latitude}, Lng: ${data.longitude} <br> Date: ${data.date}, Time: ${data.time}`;
    coordList.insertBefore(newItem, coordList.firstChild); // Add the new item at the top

    // Limit the list to 5 items
    if (coordList.children.length > 5) {
        coordList.removeChild(coordList.lastChild);
    }

    // Alarm Logic
    const radiusConfigured = localStorage.getItem('maxRadius') && localStorage.getItem('downtimeInterval');
    const alarmActive = isDowntimeActive();

    if (radiusConfigured && alarmActive) {
        const outside = isOutsideRadius(data.latitude, data.longitude);
        if (outside && !alarmTriggered) {
            // Trigger alarm
            playAlarmSound();
            alarmTriggered = true;
            console.log('Alarm triggered: Device is outside the maximum radius during downtime.');
        } else if (!outside && alarmTriggered) {
            // Reset alarm trigger if device re-enters the radius
            alarmTriggered = false;
            console.log('Alarm reset: Device is back within the maximum radius.');
        }
    } else {
        // If not configured or not active, ensure alarm is not triggered
        if (alarmTriggered) {
            alarmTriggered = false;
            console.log('Alarm reset: Configuration changed or alarm status inactive.');
        }
    }
};

// Set Home Button Handling
const setHomeBtn = document.getElementById('set-home-btn');

setHomeBtn.addEventListener('click', () => {
    isSettingHome = !isSettingHome;
    if (isSettingHome) {
        setHomeBtn.classList.add('active');
        setHomeBtn.textContent = 'Click on Map';
        map.getContainer().style.cursor = 'crosshair';
    } else {
        setHomeBtn.classList.remove('active');
        setHomeBtn.textContent = 'Set Home';
        map.getContainer().style.cursor = '';
    }
});

// Handle map clicks for setting home
map.on('click', (e) => {
    if (isSettingHome) {
        const { lat, lng } = e.latlng;

        // Remove existing home marker if any
        if (homeMarker) {
            map.removeLayer(homeMarker);
        }

        // Add new home marker
        homeMarker = L.marker([lat, lng], { icon: homeIcon }).addTo(map)
            .bindPopup('Home').openPopup();

        // Save home marker to localStorage
        saveHomeMarker(lat, lng);

        // Draw radius circle if radius is already set
        const radius = localStorage.getItem('maxRadius');
        if (radius) {
            drawRadiusCircle(lat, lng, parseInt(radius, 10));
            document.getElementById('max-radius-display').innerText = `${radius} meters`;
        }

        // If downtime interval is set, display it
        const downtime = localStorage.getItem('downtimeInterval');
        if (downtime) {
            const { start, end } = JSON.parse(downtime);
            displayDowntimeInterval(start, end);
        }

        // Reset setting home state
        isSettingHome = false;
        setHomeBtn.classList.remove('active');
        setHomeBtn.textContent = 'Set Home';
        map.getContainer().style.cursor = '';
    }
});

// Set Downtime Buttons Handling
const setRadiusBtn = document.getElementById('set-radius-btn');
const setDowntimeBtn = document.getElementById('set-downtime-btn');

// Handle Set Radius Button Click
setRadiusBtn.addEventListener('click', () => {
    if (!homeMarker) {
        alert('Please set your home location first.');
        return;
    }

    const radiusInput = prompt('Enter maximum radius in meters:', '100');
    if (radiusInput === null) return; // User cancelled
    const radius = parseInt(radiusInput, 10);

    if (isNaN(radius) || radius <= 0) {
        alert('Please enter a valid positive number for radius.');
        return;
    }

    const homeLatLng = homeMarker.getLatLng();
    drawRadiusCircle(homeLatLng.lat, homeLatLng.lng, radius);

    // Save radius to localStorage
    localStorage.setItem('maxRadius', radius);
    document.getElementById('max-radius-display').innerText = `${radius} meters`;

    // Reset alarm if radius is changed
    if (alarmTriggered) {
        alarmTriggered = false;
        console.log('Alarm reset: Radius changed.');
    }
});

// Handle Set Downtime Duration Button Click
setDowntimeBtn.addEventListener('click', () => {
    if (!homeMarker) {
        alert('Please set your home location first.');
        return;
    }

    // Prompt user for start and end times in HH:MM format
    let startTime = prompt('Enter downtime start time (e.g., 19:00 for 7 PM):', '19:00');
    if (startTime === null) return; // User cancelled
    startTime = startTime.trim();

    let endTime = prompt('Enter downtime end time (e.g., 07:00 for 7 AM):', '07:00');
    if (endTime === null) return; // User cancelled
    endTime = endTime.trim();

    // Validate time format using regex (HH:MM, 24-hour format)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        alert('Invalid time format. Please use HH:MM in 24-hour format.');
        return;
    }

    // Save downtime interval to localStorage
    const downtimeInterval = { start: startTime, end: endTime };
    localStorage.setItem('downtimeInterval', JSON.stringify(downtimeInterval));

    // Display the downtime interval on the sidebar
    displayDowntimeInterval(startTime, endTime);

    // Update alarm status immediately after setting
    updateAlarmStatus();

    // Reset alarm if downtime interval is changed
    if (alarmTriggered) {
        alarmTriggered = false;
        console.log('Alarm reset: Downtime interval changed.');
    }
});
