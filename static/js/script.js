class PaymentManager {
    constructor() {
        this.students = [];
        this.isLoading = false;
        this.currentUser = null; // Or manage user session as needed
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        const loader = document.getElementById('loader'); // Assuming a loader element with id 'loader' exists
        if (loader) {
            loader.style.display = isLoading ? 'block' : 'none';
        }
    }

    // calculatePaymentStatus(student) { // REMOVED - Backend now handles this
    // }
}

// Instantiate the PaymentManager
const paymentManager = new PaymentManager();

// Data will now be managed by the server
// let students = []; // Now managed by paymentManager
let isLoggedIn = false;
const adminPasswordDefault = "admin123";

// --- API Interaction Functions ---
async function fetchStudents() {
    paymentManager.setLoading(true);
    try {
        const response = await fetch('/api/students');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        paymentManager.students = await response.json();
        renderStudents();
        return paymentManager.students;
    } catch (error) {
        console.error("Error fetching students:", error);
        // Optionally, alert the user or show a message if students cannot be loaded
        paymentManager.showNotification('Error al cargar la lista de alumnos.', 'error');
        return [];
    } finally {
        paymentManager.setLoading(false);
    }
}

async function addStudentToServer(studentData) {
    paymentManager.setLoading(true);
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
        paymentManager.students.push(newStudent); // Add to local array for immediate UI update
        renderStudents();
        renderAdminStudentsList();
        updatePaymentStudentSelect();
        paymentManager.showNotification('Alumno agregado exitosamente.', 'success');
        return newStudent;
    } catch (error) {
        console.error("Error adding student:", error);
        paymentManager.showNotification('Error al agregar alumno.', 'error');
        return null;
    } finally {
        paymentManager.setLoading(false);
    }
}

async function registerPaymentToServer(studentId, payment) {
    paymentManager.setLoading(true);
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
        const index = paymentManager.students.findIndex(s => s.id === studentId);
        if (index !== -1) {
            paymentManager.students[index] = updatedStudent;
        }
        renderStudents();
        renderAdminStudentsList();
        // updateStudentPaymentStatus(updatedStudent); // This is now handled by renderStudents
        paymentManager.showNotification('Pago registrado exitosamente.', 'success');
        return updatedStudent;
    } catch (error) {
        console.error("Error registering payment:", error);
        paymentManager.showNotification('Error al registrar pago.', 'error');
        return null;
    } finally {
        paymentManager.setLoading(false);
    }
}

async function deleteStudentFromServer(studentId) {
    paymentManager.setLoading(true);
    try {
        const response = await fetch(`/api/students/${studentId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        paymentManager.students = paymentManager.students.filter(student => student.id !== studentId); // Remove from local array
        renderStudents();
        renderAdminStudentsList();
        updatePaymentStudentSelect();
        paymentManager.showNotification('Alumno eliminado exitosamente.', 'success');
    } catch (error) {
        console.error("Error deleting student:", error);
        paymentManager.showNotification('Error al eliminar alumno.', 'error');
    } finally {
        paymentManager.setLoading(false);
    }
}

// --- Helper Functions ---

// NEW: Helper to get the current date without time for consistent calculations
// function getTodayDate() { // No longer needed as logic is in PaymentManager
//     const today = new Date();
//     today.setHours(0, 0, 0, 0); // Set to start of the day
//     return today;
// }

// MODIFIED: Function to calculate student payment status more accurately
// function getStudentPaymentStatus(student) { // This function is now part of PaymentManager
//     const startDate = new Date(student.startDate);
//     const today = getTodayDate();
//     const oneDay = 24 * 60 * 60 * 1000; // milliseconds in one day
//
//     // Calculate total weeks elapsed since start date until today
//     const diffDays = Math.max(0, Math.floor((today - startDate) / oneDay)); // Ensure non-negative days
//     let weeksElapsed = Math.floor(diffDays / 7);
//
//     // If there are partial days in the current week, count it as a full elapsed week for billing
//     if (diffDays % 7 !== 0) {
//         weeksElapsed++;
//     }
//
//     // Handle cases where start date is in the future or today
//     if (startDate > today) {
//         weeksElapsed = 0; // Student hasn't started yet
//     } else if (diffDays === 0 && student.totalPaid === 0) {
//         // If student started today and paid nothing, they owe 1 week
//         weeksElapsed = 1;
//     } else if (diffDays === 0 && student.totalPaid > 0) {
//         // If student started today and paid something, they are paid
//         weeksElapsed = 0; // Or based on payment amount, but for now, consider paid for day 0
//     }
//
//
//     const owedAmount = weeksElapsed * student.weeklyAmount;
//     let balance = owedAmount - student.totalPaid; // Positive balance = owed, Negative balance = credit
//
//     let statusText = '';
//     let isPaidUp = false;
//
//     const lastPaymentDate = student.lastPaymentDate ? new Date(student.lastPaymentDate) : null;
//     const daysSinceLastPayment = lastPaymentDate ? Math.floor(Math.abs(today - lastPaymentDate) / oneDay) : Infinity;
//
//
//     if (balance > 0) {
//         // Student owes money
//         isPaidUp = false;
//         const weeksOwed = Math.ceil(balance / student.weeklyAmount);
//         statusText = `Atrasado 🔴 (${weeksOwed} semana${weeksOwed !== 1 ? 's' : ''})`;
//     } else if (balance <= 0) {
//         // Student is paid up or has a credit
//         isPaidUp = true;
//
//         // Determine status text based on last payment and balance
//         if (balance < 0) {
//             const weeksInCredit = Math.floor(Math.abs(balance) / student.weeklyAmount);
//             if (weeksInCredit > 0) {
//                  statusText = `Pagado Adelantado ✅ (${weeksInCredit} semana${weeksInCredit !== 1 ? 's' : ''})`;
//             } else {
//                 statusText = 'Al Día ✅'; // Small negative balance, not enough for a full week credit
//             }
//         } else { // balance is 0
//             statusText = 'Al Día ✅';
//         }
//
//         // Add "Revisar" warning if last payment is old, even if balance is good.
//         // This threshold might need adjustment based on when you expect payments.
//         // For example, if weekly payments are expected, more than 7 days without payment is a flag.
//         if (lastPaymentDate && daysSinceLastPayment >= 7 && statusText.includes('Al Día')) {
//             statusText = statusText.replace('Al Día ✅', 'Pago Reciente (revisar) ⚠️');
//         } else if (lastPaymentDate && daysSinceLastPayment >= 14 && (statusText.includes('Al Día') || statusText.includes('Pagado Adelantado'))) {
//              statusText = statusText.replace('Al Día ✅', 'Pago Antiguo (revisar) ⚠️');
//              statusText = statusText.replace('Pagado Adelantado ✅', 'Pago Antiguo (revisar) ⚠️');
//         }
//     }
//
//
//     return {
//         weeksElapsed: weeksElapsed,
//         balance: balance,
//         isPaidUp: isPaidUp,
//         statusText: statusText
//     };
// }


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

    paymentManager.students.forEach(student => {
        const status = student.paymentStatus || {}; // Use backend status, ensure it exists

        // Logic for paid/unpaid count.
        if (status.is_current) {
            paidCount++;
        } else {
            unpaidCount++;
        }
        // Use total_paid_actual from status if available, otherwise fallback to student.totalPaid
        const totalPaidForStudent = status.total_paid_actual !== undefined ? status.total_paid_actual : (student.totalPaid || 0);
        totalCollected += totalPaidForStudent;


        // Filter students based on search input
        if (currentSearchTerm && !student.name.toLowerCase().includes(currentSearchTerm)) {
            return; // Skip if not matching search term
        }

        const studentDiv = document.createElement('div');
        studentDiv.className = `student-card ${status.is_current ? 'paid' : 'unpaid'}`;
        studentDiv.innerHTML = `
            <div class="student-info">
                <h3>${student.name}</h3>
                <small>${student.grade || 'N/A'}</small>
                <small>Inicio: ${new Date(student.startDate).toLocaleDateString('es-ES')}</small>
            </div>
            <div class="student-status">
                <small>Semanas Transcurridas: ${status.weeks_elapsed !== undefined ? status.weeks_elapsed : 'N/A'}</small><br>
                <small>Semanas Pagadas: ${status.semanas_pagadas !== undefined ? status.semanas_pagadas : 'N/A'}</small><br>
                <small>Semanas Faltantes: ${status.semanas_faltantes !== undefined ? status.semanas_faltantes : 'N/A'}</small><br>
                <small>Total Abonado: $${(status.total_paid_actual !== undefined ? status.total_paid_actual : student.totalPaid || 0).toFixed(2)}</small><br>
                <small style="color: ${status.status_color || '#000'}; font-weight: bold;">${status.status_text || 'Estado no disponible'}</small><br>
                <small style="color: #666;">Último pago: ${student.lastPaymentDate ? new Date(student.lastPaymentDate).toLocaleDateString('es-ES') : 'Ninguno'}</small>
            </div>
        `;
        studentListDiv.appendChild(studentDiv);
    });

    // Update stats cards
    // Ensure totalCollected is displayed correctly, it's already summed up using the correct totalPaid value
    document.getElementById('totalStudents').textContent = paymentManager.students.length;
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
        document.getElementById('editStudentSection').style.display = 'none'; // Ensure edit form is hidden initially
        document.getElementById('adminStudentsList').style.display = 'block'; // Ensure list is visible
        renderAdminStudentsList();
        updatePaymentStudentSelect();
    }
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
    document.getElementById('adminPassword').value = ''; // Clear password field
    cancelEditStudent(); // Add this to ensure edit form is hidden and reset
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
        paymentManager.showNotification('Contraseña incorrecta.', 'error');
    }
}

function logout() {
    isLoggedIn = false;
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
    paymentManager.showNotification('Sesión cerrada.', 'info');
    closeAdminModal(); // Close modal on logout
}

// Function to handle adding a new student
async function addStudent() {
    const studentNameInput = document.getElementById('studentName');
    const name = studentNameInput.value.trim();

    if (!name) {
        paymentManager.showNotification('Por favor, ingresa el nombre del alumno.', 'warning');
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
    paymentManager.students.forEach(student => {
        const status = student.paymentStatus || {}; // Use backend status, ensure it exists

        const studentDiv = document.createElement('div');
        studentDiv.className = 'admin-student-item';
        studentDiv.innerHTML = `
            <div>
                <strong>${student.name}</strong> (${student.grade || 'N/A'})<br>
                <small>Semanas Pagadas: ${status.semanas_pagadas !== undefined ? status.semanas_pagadas : 'N/A'} | Semanas Faltantes: ${status.semanas_faltantes !== undefined ? status.semanas_faltantes : 'N/A'}</small><br>
                <small>Total Abonado: $${(status.total_paid_actual !== undefined ? status.total_paid_actual : student.totalPaid || 0).toFixed(2)}</small><br>
                <small style="color: ${status.status_color || '#000'};">${status.status_text || 'N/A'}</small><br>
                <small style="color: #666;">Último pago: ${student.lastPaymentDate ? new Date(student.lastPaymentDate).toLocaleDateString('es-ES') : 'Ninguno'}</small>
            </div>
            <div style="margin-top: 10px;">
                <button class="btn btn-danger" onclick="deleteStudent(${student.id})" style="font-size: 14px; padding: 8px 15px;">
                    Eliminar
                </button>
                <button class="btn btn-secondary" onclick="showEditStudentForm(${student.id})" style="font-size: 14px; padding: 8px 15px; margin-left: 5px;">
                    Editar
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
    paymentManager.students.forEach(student => {
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
        paymentManager.showNotification('Por favor, complete todos los campos de pago correctamente.', 'warning');
        return;
    }

    const selectedStudent = paymentManager.students.find(s => s.id === parseInt(studentId));
    if (!selectedStudent) {
        paymentManager.showNotification('Alumno no encontrado.', 'error');
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

// --- Student Edit Functions ---
function showEditStudentForm(studentId) {
    const student = paymentManager.students.find(s => s.id === studentId);
    if (!student) {
        paymentManager.showNotification('Error: Alumno no encontrado.', 'error');
        return;
    }

    // Populate the form
    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editStudentName').value = student.name;
    document.getElementById('editStudentGrade').value = student.grade;
    document.getElementById('editStudentWeeklyAmount').value = student.weeklyAmount;
    document.getElementById('editStudentStartDate').value = student.startDate; // Assumes YYYY-MM-DD

    // Show the edit form, hide student list
    document.getElementById('editStudentSection').style.display = 'block';
    document.getElementById('adminStudentsList').style.display = 'none';
    // Consider hiding other forms like add student / register payment if they are visually conflicting
}

function cancelEditStudent() {
    document.getElementById('editStudentSection').style.display = 'none';
    document.getElementById('adminStudentsList').style.display = 'block'; // Show the list again
    // Clear form fields
    document.getElementById('editStudentId').value = '';
    document.getElementById('editStudentName').value = '';
    document.getElementById('editStudentGrade').value = '';
    document.getElementById('editStudentWeeklyAmount').value = '';
    document.getElementById('editStudentStartDate').value = '';
}

async function updateStudentToServer(studentId, studentData) {
    paymentManager.setLoading(true);
    try {
        const response = await fetch(`/api/students/${studentId}`, { // Uses the existing PUT endpoint
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(studentData), // Send the whole student object
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const updatedStudent = await response.json();
        const index = paymentManager.students.findIndex(s => s.id === studentId);
        if (index !== -1) {
            paymentManager.students[index] = updatedStudent;
        }

        renderStudents(); // Re-render main list
        renderAdminStudentsList(); // Re-render admin list
        updatePaymentStudentSelect(); // Update dropdowns
        paymentManager.showNotification('Alumno actualizado exitosamente.', 'success');
        return updatedStudent;
    } catch (error) {
        console.error("Error updating student:", error);
        paymentManager.showNotification(error.message || 'Error al actualizar alumno.', 'error');
        return null;
    } finally {
        paymentManager.setLoading(false);
    }
}

async function handleUpdateStudent() {
    const studentId = parseInt(document.getElementById('editStudentId').value);
    const name = document.getElementById('editStudentName').value.trim();
    const grade = document.getElementById('editStudentGrade').value.trim();
    const weeklyAmount = parseFloat(document.getElementById('editStudentWeeklyAmount').value);
    const startDate = document.getElementById('editStudentStartDate').value;

    if (!name) {
        paymentManager.showNotification('El nombre es obligatorio.', 'warning');
        return;
    }
    if (isNaN(weeklyAmount) || weeklyAmount < 0) {
        paymentManager.showNotification('El monto semanal debe ser un número positivo.', 'warning');
        return;
    }
    if (!startDate) {
        paymentManager.showNotification('La fecha de inicio es obligatoria.', 'warning');
        return;
    }
    // Basic date format validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate)) {
        paymentManager.showNotification('Formato de fecha de inicio inválido. Use YYYY-MM-DD.', 'warning');
        return;
    }

    const studentData = {
        name,
        grade,
        weeklyAmount,
        startDate,
    };

    const updated = await updateStudentToServer(studentId, studentData);
    if (updated) {
        cancelEditStudent(); // Hide form and clear fields
    }
}

// --- Excel Export Function ---
function exportStudentsToExcel() {
    // This will simply open the URL for the download.
    // The browser will handle the file download based on the Content-Disposition header set by Flask.
    paymentManager.setLoading(true); // Show loader while request is made
    window.location.href = '/api/students/export/excel';

    // It's tricky to know exactly when the download starts/finishes from JS this way
    // to turn off the loader precisely. A common approach is a short delay.
    setTimeout(() => {
        paymentManager.setLoading(false);
    }, 2000); // Hide loader after 2 seconds (adjust as needed)
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