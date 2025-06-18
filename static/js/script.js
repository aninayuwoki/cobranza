// Data will now be managed by the server
let students = [];
let isLoggedIn = false;
const adminPasswordDefault = "admin123";

// --- API Interaction Functions ---
async function fetchStudents() {
    try {
        const response = await fetch('/api/students');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        students = await response.json();
        renderStudents();
        return students;
    } catch (error) {
        console.error("Error fetching students:", error);
        // Optionally, alert the user or show a message if students cannot be loaded
        // alert('Error al cargar la lista de alumnos. Asegúrate de que el servidor esté funcionando.');
        return [];
    }
}

async function addStudentToServer(studentData) {
    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(studentData)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const newStudent = await response.json();
        students.push(newStudent); // Add to local array for immediate UI update
        renderStudents();
        renderAdminStudentsList();
        updatePaymentStudentSelect();
        alert('Alumno agregado exitosamente.');
        return newStudent;
    } catch (error) {
        console.error("Error adding student:", error);
        alert('Error al agregar alumno.');
        return null;
    }
}

async function registerPaymentToServer(studentId, payment) {
    try {
        const response = await fetch(`/api/students/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ payment: payment })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // Update the local student object
        const updatedStudent = await response.json();
        const index = students.findIndex(s => s.id === studentId);
        if (index !== -1) {
            students[index] = updatedStudent;
        }
        renderStudents();
        renderAdminStudentsList();
        // updateStudentPaymentStatus(updatedStudent); // This is now handled by renderStudents
        alert('Pago registrado exitosamente.');
        return updatedStudent;
    } catch (error) {
        console.error("Error registering payment:", error);
        alert('Error al registrar pago.');
        return null;
    }
}

async function deleteStudentFromServer(studentId) {
    try {
        const response = await fetch(`/api/students/${studentId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        students = students.filter(student => student.id !== studentId); // Remove from local array
        renderStudents();
        renderAdminStudentsList();
        updatePaymentStudentSelect();
        alert('Alumno eliminado exitosamente.');
    } catch (error) {
        console.error("Error deleting student:", error);
        alert('Error al eliminar alumno.');
    }
}

// --- Helper Functions ---

// NEW: Helper to get the current date without time for consistent calculations
function getTodayDate() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of the day
    return today;
}

// MODIFIED: Function to calculate student payment status more accurately
function getStudentPaymentStatus(student) {
    const startDate = new Date(student.startDate);
    const today = getTodayDate();
    const oneDay = 24 * 60 * 60 * 1000; // milliseconds in one day

    // Calculate total weeks elapsed since start date until today
    const diffDays = Math.max(0, Math.floor((today - startDate) / oneDay)); // Ensure non-negative days
    let weeksElapsed = Math.floor(diffDays / 7);

    // If there are partial days in the current week, count it as a full elapsed week for billing
    if (diffDays % 7 !== 0) {
        weeksElapsed++;
    }

    // Handle cases where start date is in the future or today
    if (startDate > today) {
        weeksElapsed = 0; // Student hasn't started yet
    } else if (diffDays === 0 && student.totalPaid === 0) {
        // If student started today and paid nothing, they owe 1 week
        weeksElapsed = 1;
    } else if (diffDays === 0 && student.totalPaid > 0) {
        // If student started today and paid something, they are paid
        weeksElapsed = 0; // Or based on payment amount, but for now, consider paid for day 0
    }


    const owedAmount = weeksElapsed * student.weeklyAmount;
    let balance = owedAmount - student.totalPaid; // Positive balance = owed, Negative balance = credit

    let statusText = '';
    let isPaidUp = false;

    const lastPaymentDate = student.lastPaymentDate ? new Date(student.lastPaymentDate) : null;
    const daysSinceLastPayment = lastPaymentDate ? Math.floor(Math.abs(today - lastPaymentDate) / oneDay) : Infinity;


    if (balance > 0) {
        // Student owes money
        isPaidUp = false;
        const weeksOwed = Math.ceil(balance / student.weeklyAmount);
        statusText = `Atrasado 🔴 (${weeksOwed} semana${weeksOwed !== 1 ? 's' : ''})`;
    } else if (balance <= 0) {
        // Student is paid up or has a credit
        isPaidUp = true;
        
        // Determine status text based on last payment and balance
        if (balance < 0) {
            const weeksInCredit = Math.floor(Math.abs(balance) / student.weeklyAmount);
            if (weeksInCredit > 0) {
                 statusText = `Pagado Adelantado ✅ (${weeksInCredit} semana${weeksInCredit !== 1 ? 's' : ''})`;
            } else {
                statusText = 'Al Día ✅'; // Small negative balance, not enough for a full week credit
            }
        } else { // balance is 0
            statusText = 'Al Día ✅';
        }

        // Add "Revisar" warning if last payment is old, even if balance is good.
        // This threshold might need adjustment based on when you expect payments.
        // For example, if weekly payments are expected, more than 7 days without payment is a flag.
        if (lastPaymentDate && daysSinceLastPayment >= 7 && statusText.includes('Al Día')) {
            statusText = statusText.replace('Al Día ✅', 'Pago Reciente (revisar) ⚠️');
        } else if (lastPaymentDate && daysSinceLastPayment >= 14 && (statusText.includes('Al Día') || statusText.includes('Pagado Adelantado'))) {
             statusText = statusText.replace('Al Día ✅', 'Pago Antiguo (revisar) ⚠️');
             statusText = statusText.replace('Pagado Adelantado ✅', 'Pago Antiguo (revisar) ⚠️');
        }
    }


    return {
        weeksElapsed: weeksElapsed,
        balance: balance,
        isPaidUp: isPaidUp,
        statusText: statusText
    };
}


// Function to render students in the main list
function renderStudents() {
    // IMPORTANT: Make sure this ID matches your HTML (from the previous step: 'studentList' or 'studentsGrid')
    const studentListDiv = document.getElementById('studentList') || document.getElementById('studentsGrid'); 
    if (!studentListDiv) {
        console.error("Element with ID 'studentList' or 'studentsGrid' not found.");
        return;
    }
    studentListDiv.innerHTML = ''; // Clear current list

    let paidCount = 0;
    let unpaidCount = 0;
    let totalCollected = 0;

    const currentSearchTerm = document.getElementById('searchInput').value.toLowerCase();

    students.forEach(student => {
        const status = getStudentPaymentStatus(student);

        // Logic for paid/unpaid count. A student with balance <= 0 is considered paid up.
        if (status.balance <= 0) { // Check balance directly
            paidCount++;
        } else {
            unpaidCount++;
        }
        totalCollected += student.totalPaid; // Summing up totalPaid from each student

        // Filter students based on search input
        if (currentSearchTerm && !student.name.toLowerCase().includes(currentSearchTerm)) {
            return; // Skip if not matching search term
        }

        const statusText = status.statusText;

        const studentDiv = document.createElement('div');
        // Apply 'paid' class if balance is not positive (paid up or credit)
        studentDiv.className = `student-card ${status.balance <= 0 ? 'paid' : 'unpaid'}`; 
        studentDiv.innerHTML = `
            <div class="student-info">
                <h3>${student.name}</h3>
                <small>${student.grade}</small>
                <small>Inicio: ${new Date(student.startDate).toLocaleDateString('es-ES')}</small>
            </div>
            <div class="student-status">
                <small>Semanas transcurridas: ${status.weeksElapsed}</small><br>
                <small>Pagado: $${student.totalPaid.toFixed(2)}</small><br>
                <small>Balance adeudado: $${status.balance.toFixed(2)}</small><br>
                <small style="color: ${status.balance <= 0 ? '#27ae60' : '#e74c3c'}; font-weight: bold;">${statusText}</small><br>
                <small style="color: #666;">Último pago: ${student.lastPaymentDate ? new Date(student.lastPaymentDate).toLocaleDateString('es-ES') : 'Ninguno'}</small>
            </div>
        `;
        studentListDiv.appendChild(studentDiv);
    });

    // Update stats cards
    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('paidStudents').textContent = paidCount;
    document.getElementById('unpaidStudents').textContent = unpaidCount;
    document.getElementById('totalCollected').textContent = `$${totalCollected.toFixed(2)}`;
}

// Function to handle student search
function searchStudents() {
    renderStudents(); // Re-render to apply search filter
}

// --- Admin Modal Functions ---
function showAdminModal() {
    document.getElementById('adminModal').style.display = 'block';
    if (!isLoggedIn) {
        document.getElementById('adminLogin').style.display = 'block';
        document.getElementById('adminContent').style.display = 'none';
    } else {
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        renderAdminStudentsList();
        updatePaymentStudentSelect();
    }
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
    document.getElementById('adminPassword').value = ''; // Clear password field
}

function login() {
    const password = document.getElementById('adminPassword').value;
    if (password === adminPasswordDefault) {
        isLoggedIn = true;
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        renderAdminStudentsList();
        updatePaymentStudentSelect();
    } else {
        alert('Contraseña incorrecta.');
    }
}

function logout() {
    isLoggedIn = false;
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
    alert('Sesión cerrada.');
    closeAdminModal(); // Close modal on logout
}

// Function to handle adding a new student
async function addStudent() {
    const studentNameInput = document.getElementById('studentName');
    const name = studentNameInput.value.trim();

    if (!name) {
        alert('Por favor, ingresa el nombre del alumno.');
        return;
    }

    const newStudent = {
        name: name,
        grade: "Estudiante", // Default grade
        weeklyAmount: 2.00, // Default weekly amount
        startDate: new Date().toISOString().split('T')[0], // Current date as start date
        totalPaid: 0.00,
        paymentHistory: [],
        lastPaymentDate: null
    };

    await addStudentToServer(newStudent);
    studentNameInput.value = ''; // Clear input
}


// Function to render students in the admin panel's deletion list
function renderAdminStudentsList() {
    const list = document.getElementById('adminStudentsList');
    if (!list) {
        console.error("Element with ID 'adminStudentsList' not found.");
        return;
    }
    list.innerHTML = '';
    students.forEach(student => {
        const status = getStudentPaymentStatus(student); // Get status for display
        const statusText = status.statusText;

        const studentDiv = document.createElement('div');
        studentDiv.className = 'admin-student-item';
        studentDiv.innerHTML = `
            <div>
                <strong>${student.name}</strong> (${student.grade})<br>
                <small>Semanas: ${status.weeksElapsed} | Pagado: $${student.totalPaid.toFixed(2)} | Balance: $${status.balance.toFixed(2)}</small><br>
                <small style="color: ${status.balance <= 0 ? '#27ae60' : '#e74c3c'};">${statusText}</small><br>
                <small style="color: #666;">Último pago: ${student.lastPaymentDate ? new Date(student.lastPaymentDate).toLocaleDateString('es-ES') : 'Ninguno'}</small>
            </div>
            <div style="margin-top: 10px;">
                <button class="btn btn-danger" onclick="deleteStudent(${student.id})" style="font-size: 14px; padding: 8px 15px;">
                    Eliminar
                </button>
            </div>
        `;

        list.appendChild(studentDiv);
    });
}

// Function to populate the student select dropdown for payments
function updatePaymentStudentSelect() {
    const select = document.getElementById('paymentStudent');
    if (!select) {
        console.error("Element with ID 'paymentStudent' not found.");
        return;
    }
    select.innerHTML = '<option value="">Seleccione un alumno...</option>'; // Clear and add default
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = student.name;
        select.appendChild(option);
    });
}

// Function to register a payment
async function registerPayment() {
    const studentId = document.getElementById('paymentStudent').value;
    const amount = parseFloat(document.getElementById('paymentAmountInput').value);
    const paymentDate = document.getElementById('paymentDate').value;

    if (!studentId || isNaN(amount) || amount <= 0 || !paymentDate) {
        alert('Por favor, complete todos los campos de pago correctamente.');
        return;
    }

    const selectedStudent = students.find(s => s.id === parseInt(studentId));
    if (!selectedStudent) {
        alert('Alumno no encontrado.');
        return;
    }

    const payment = {
        date: paymentDate,
        amount: amount,
        timestamp: new Date().toISOString() // Record payment time
    };

    await registerPaymentToServer(parseInt(studentId), payment);

    // Clear form fields after successful registration
    document.getElementById('paymentStudent').value = '';
    document.getElementById('paymentAmountInput').value = '2.00'; // Reset to default
    document.getElementById('paymentDate').value = '';
}

// No longer strictly needed as renderStudents() handles the full update
// function updateStudentPaymentStatus(updatedStudent) { }


async function deleteStudent(studentId) {
    if (confirm('¿Está seguro de eliminar este alumno? Esta acción no se puede deshacer.')) {
        await deleteStudentFromServer(studentId);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Only add listeners if elements exist
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', searchStudents);
    } else {
        console.warn("Element with ID 'searchInput' not found. Search functionality may not work.");
    }

    const adminPasswordInput = document.getElementById('adminPassword');
    if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    } else {
        console.warn("Element with ID 'adminPassword' not found. Admin login via Enter key may not work.");
    }

    // Cerrar modal al hacer clic fuera
    window.onclick = function(event) {
        const modal = document.getElementById('adminModal');
        if (modal && event.target === modal) {
            closeAdminModal();
        }
    }

    // Inicializar la aplicación
    fetchStudents(); // Load students from server on startup
});