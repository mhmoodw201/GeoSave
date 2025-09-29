// اضافة منتجات جديدة 

let userLocation;

if (navigator.geolocation) { // الحصول على الموقع الجغرافي للمستخدم
    navigator.geolocation.getCurrentPosition((position) => {
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
    });
}


// this code about add products - اضافة اعلان

document.getElementById('add-product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token'); // التحقق من توكن المستخدم

    if (!token) {
        alert('You must be logged in to add a product.');
        return;
    }

    const name = document.getElementById('name').value;
    const description = document.getElementById('description').value;
    const pricePerDay = document.getElementById('price').value;
    const image = document.getElementById('image').files[0];
    const phoneNumber = document.getElementById('phone').value;

    // const location = document.getElementById('location').value;

    const formData = new FormData();

    formData.append('name', name);
    formData.append('description', description);
    formData.append('pricePerDay', pricePerDay);
    formData.append('latitude', userLocation.lat);
    formData.append('longitude', userLocation.lng);
    formData.append('owner', localStorage.getItem('adminID'));
    formData.append('image', image);
    formData.append('phoneNumber', phoneNumber);

    try {
        const response = await axios.post('http://localhost:5000/products', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
    

        const data = response.data; // البيانات من الاستجابة
        alert(data.name ? 'Product added successfully!': data.error);
        window.location.href = 'index.html'; // إعادة التوجيه إلى الصفحة الرئيسية
        
        console.log(data.name);


    } catch (error) {
        console.error(error);
        console.log(formData.get("name"))
        
    }
});


// تسجيل مستخدم جديد 


document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await axios.post('http://localhost:5000/register', {
            name,
            email,
            password,
        });

        const data = response.data; // استرجاع البيانات من الاستجابة
        alert(data ? 'Registered Successfully' : data.error);
        console.log(data);
        if (data) { window.location.href = 'index.html'; } // إعادة التوجيه إلى الصفحة الرئيسية
        localStorage.setItem('adminID',data.adminID); // إزالة التوكن
        localStorage.setItem('token',data.token); // إزالة التوكن

    } catch (error) {
        console.error(error);
        // console.error(name);
        // console.error(email);
        // console.error(password);


        // التحقق من وجود رسالة خطأ في الاستجابة
        if (error.response) {
            console.error('Server Error:', error.response.data);
            alert(error.response.data.error || 'An error occurred');
            console.log(data);
        } else {
            alert('Failed to connect to the server.');
        }
    }
});




// الحصول على الموقع الجغرافي للمستخدم
document.addEventListener("DOMContentLoaded", async () => {

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition( async (position) => {
            const userLocation = {
                userLatitude: position.coords.latitude,
                userLongitude: position.coords.longitude,
            };
            fetchProducts(userLocation.userLatitude, userLocation.userLongitude);
            
        });
    } else {
        alert('الرجاء تمكين الوصول إلى الموقع لعرض الإعلانات القريبة.');
    }
});




// يجلب المنتجات 
// دالة لجلب الإعلانات من API وعرضها

async function fetchProducts(userLatitude, userLongitude) {
    try {
        const response = await fetch('http://localhost:5000/products/');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
           throw new Error('Invalid content-type received, expected application/json.');
        }
        const products = await response.json();
        const adsContainer = document.getElementById("adsContainer");

        adsContainer.innerHTML = ''; // مسح الإعلانات القديمة

        isAdmin = localStorage.getItem('admin');
        isSameUser = localStorage.getItem('adminID');

        products.forEach(ad => {
           
            const lat1 = userLatitude; 
            const lng1 = userLongitude;
            const lat2 = ad.latitude;
            const lng2 = ad.longitude;

            const distance = calculateDistance(parseFloat(lat1), parseFloat(lng1), parseFloat(lat2), parseFloat(lng2));
           

            // تجاهل المنتجات التي تقع خارج 5 كم
            if (distance > 5000) return;


            // إنشاء عنصر الإعلان
            const adElement = document.createElement("div");
            adsContainer.appendChild(adElement);
            adElement.classList.add("ad");
            adElement.classList.add("hold_product");
            adElement.dataset._id = ad._id;

            if(ad?.status === "confirmed"){
                adElement.classList.add("active");
                if(isAdmin){
                    adElement.classList.remove("active");
                }
            }
            console.log(formatDistance(distance))


            
            const content = `
                <div>
                    <span class="${ad?.status === "confirmed" && "isConfirmed"}"></span>
                    <img src="http://localhost:5000/${ad.image}" alt="${ad.name}" class="img_product">
                    <h2>${ad.name}</h2>
                    <p class="text"><i class="fa-solid fa-money-bill-1-wave" style="color: #000333;"></i> ${ad.pricePerDay} SAR per day</p>
                    <p class="text"><i class="fa-solid fa-user" style="color: #000333;"></i> ${ad.owner.name}</p>
                    <p class="text"><i class="fa-solid fa-location-dot" style="color: #000333;"></i> ${formatDistance(distance)}</p>
                    ${isAdmin? `<button class="del" onClick="deleteProduct('${ad._id}')"><i class="fa-solid fa-trash"></i></button>`: ""}
                </div>
            `; 

            adElement.innerHTML = content; 



            // إنشاء النافذة المنبثقة
            const popup = document.createElement("div");
            popup.classList.add("popup");
            popup.id = `popup-${ad._id}`;

            const popupContent = `
                <div class="popup-content">
                    <img src="http://localhost:5000/${ad.image}" alt="${ad.name}" class="img_product">
                    <h2>${ad.name}</h2>
                    <p>${ad.description}</p>
                    <p class="text"><i class="fa-solid fa-user" style="color: #000333;"></i> ${ad.owner.name}</p>
                    <p class="text"><i class="fa-solid fa-money-bill-1-wave" style="color: #000333;"></i> ${ad.pricePerDay} SAR per day</p>

                    ${isAdmin || isSameUser === ad.owner._id? "":`<button onClick="addBooking('${ad._id}')">Booking Product</button>`}
                </div>
            `;
            popup.innerHTML = popupContent;
            document.body.appendChild(popup);
        });

        

        // إضافة الأحداث للنقر على الإعلانات

        adsContainer.addEventListener("click", (e) => {
            e.stopPropagation();
            const adElement = e.target.closest(".ad");

            if (adElement) {
                const adId = adElement.dataset._id;
                const popup = document.getElementById(`popup-${adId}`);
                if (popup) {
                    popup.style.display = "flex";
                }
            }
        });
    // }
        // إغلاق النوافذ المنبثقة عند النقر خارجها
        document.body.addEventListener("click", (e) => {
            if (e.target.classList.contains("popup")) {
                e.target.style.display = "none";
            }
        });
    } catch (error) {
        console.error(error);
    }
}


// دالة لحساب المسافة بين نقطتين (الإحداثيات)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // نصف قطر الأرض بالكيلومترات
    const dLat = degreesToRadians(lat2 - lat1);
    const dLng = degreesToRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(degreesToRadians(lat1)) * Math.cos(degreesToRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c * 1000; // المسافة بالمتر
    return distance;
}

// دالة لتحويل الدرجات إلى راديان
function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// دالة لتنسيق المسافة (متر أو كيلومتر)
function formatDistance(distance) {
    if (distance >= 1000) {
        return `${(distance / 1000).toFixed(2)} KM`;
    } else {
        return `${distance.toFixed(0)} m`;
    }
}




// تسجيل الدخول

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        // إرسال الطلب باستخدام Axios
        const response = await axios.post('http://localhost:5000/login', {
            email,
            password,
        });

        const data = response.data; // الحصول على البيانات من الاستجابة
        if (data.token) {
            localStorage.setItem('token', data.token); // تخزين التوكن في Local Storage
            localStorage.setItem('adminID', data.adminID); // تخزين التوكن في Local Storage
            if(data.name === "admin"){
                localStorage.setItem('admin', data.adminID);
            }
            console.log(data);
            alert('Login successful!');
            window.location.href = 'index.html'; // إعادة التوجيه إلى الصفحة الرئيسية
        } else {
            alert(data.error || 'Login failed.');
        }
    } catch (error) {
        console.error(error);
        console.error(email);
        console.error(password);

        // التحقق من وجود رسالة خطأ في الاستجابة
        if (error.response) {
            console.error('Server Error:', error.response.data);
            alert(error.response.data.error || 'Login failed.');
        } else {
            alert('Failed to connect to the server.');
        }
    }
});



// بيانات المستخدم 

async function getInfo() {
    const name = document.querySelector('.name');
    const email = document.querySelector('.email');

    const userId = localStorage.getItem('adminID');
    const token = localStorage.getItem('token');


    const response = await axios.get(`http://localhost:5000/info?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const info = await response.data;
    name.innerHTML = info[0].name
    email.innerHTML = info[0].email
}
if(localStorage.getItem('token')){
    getInfo()
}


// عرض المنتجات الخاصة بالمستخدم في صفحة المستخدم 

async function fetchMyProducts() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('adminID');

    if (!token) {
        alert('You must be logged in to access your products.');
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/my-products?userId=${userId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const products = await response.json();

        console.log(products)

        const productList = document.getElementById('product-list');
        productList.innerHTML = products.length

            ? products.map(product => `
                <div class="products">
                    <div class="${product?.status === "confirmed" && "taken"}"></div>
                    ${product?.status === "confirmed" ? `<div class="spinner">
                        <div class="spinner1"></div>
                      </div>`: ""
                    }
                    <img src="http://localhost:5000/${product.image}" alt="${product.name}" class="img_product">
                    <h3>${product.name}</h3>
                    <p>${product.description}</p>
                    <p class="text"><i class="fa-solid fa-money-bill-1-wave" style="color: #000333;"></i> ${product.pricePerDay} SAR per day</p>
                    <button onclick="deleteProduct('${product._id}')">Delete</button>
                </div>
            `).join('') 
            : '<p>No products found.</p>';
    } catch (error) {
        console.error(error);
    }
}



// حذف إعلان في صفحة المستخدم

async function deleteProduct(productId) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('You must be logged in to delete a product.');
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/products/${productId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        alert(data.message || 'Product deleted successfully.');
        fetchMyProducts(); // تحديث قائمة الإعلانات
        window.location.reload();
    } catch (error) {
        console.error(error);
    }
}



// تسجيل الخروج

document.getElementById('logout')?.addEventListener('click', () => {
    localStorage.removeItem('adminID'); // إزالة التوكن
    localStorage.removeItem('admin');
    localStorage.removeItem('token'); // إزالة التوكن
    alert('Logged out successfully.');
    window.location.href = 'login.html';
});



// إضافة حجز للمنتج إلى صفحة المستخدم

async function addBooking(productId) {
    // e.preventDefault();

    const userId = localStorage.getItem('adminID'); // التحقق من توكن المستخدم

    try {
        const response = await axios.post('http://localhost:5000/bookings', {
            userId,
            productId,
        });

        const data = response.data; // استرجاع البيانات من الاستجابة
        alert(data ? 'add booking Successfully' : data.error);
        console.log(data);
        if (data) { window.location.href = 'account.html'; } // إعادة التوجيه إلى الصفحة الرئيسية

    } catch (error) {
        console.error(error);
    }
}


// جلب الحجوزات الخاصة بالمستخدم

async function fetchMyBookings() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('You must be logged in to access your bookings.');
        window.location.href = 'login.html';
        return;
    }
    
    const userId = localStorage.getItem('adminID'); // التحقق من توكن المستخدم


    try {
        const response = await axios.get(`http://localhost:5000/bookings/my-bookings?userId=${userId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const bookings = await response.data;
        console.log(bookings);
        const bookingList = document.getElementById('booking-list');
        bookingList.innerHTML = bookings.length
            ? bookings.map(booking => `
                <div class="bookings">
                    <img src="http://localhost:5000/${booking.productId.image}" alt="${booking.productId.name}" class="img_product">
                    <h3>${booking.productId.name}</h3>
                    <p>${booking.productId.description}</p>
                    <p class="text"><i class="fa-solid fa-money-bill-1-wave" style="color: #000333;"></i> ${booking.productId.pricePerDay} SAR per day</p>
                    <button class="whatsapp-button" onclick="window.open('https://wa.me/${booking.productId.phoneNumber}', '_blank')"> Contact via WhatsApp <i class="fa-brands fa-whatsapp" style="color: #ffffff;"></i></button>
                    <button onclick="cancelBooking('${booking._id}')">Remove Booking</button>
                </div>
            `).join('') // <p class="text"><i class="fa-solid fa-user" style="color: #000333;"></i> ${booking.productId.owner.name}</p>
            : '<p>No Bookings found.</p>'; 
            
        
    } catch (error) {
        console.error(error);
    }
}



// إلغاء الحجز

async function cancelBooking(bookingId) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('You must be logged in to cancel a booking.');
        return;
    }

    try {
        const response = await axios.delete(`http://localhost:5000/bookings/del/${bookingId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.data;
        alert(data.message || 'Booking cancelled successfully.');
        fetchMyBookings(); // تحديث قائمة الحجوزات
    } catch (error) {
        console.error(error);
    }
}
