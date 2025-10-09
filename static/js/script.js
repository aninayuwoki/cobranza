// Los datos ahora los maneja el servidor, ya no guardamos nada aqui xd
let students = [];
let isLoggedIn = false;
const adminPasswordDefault = "admin123";

// --- Funciones para interactuar con la API del servidor ---
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
        // opcionalmente se puede alertar al usuario o mostrar un mensaje si no se pueden cargar los alumnos
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
        students.push(newStudent); // agregar al array local para actualizar la interfaz de inmediato
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
        // actualizar el objeto del estudiante localmente
        const updatedStudent = await response.json();
        const index = students.findIndex(s => s.id === studentId);
        if (index !== -1) {
            students[index] = updatedStudent;
        }
        renderStudents();
        renderAdminStudentsList();
        // updateStudentPaymentStatus(updatedStudent); // esto ahora lo maneja renderStudents
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
        students = students.filter(student => student.id !== studentId); // quitar del array local
        renderStudents();
        renderAdminStudentsList();
        updatePaymentStudentSelect();
        alert('Alumno eliminado exitosamente.');
    } catch (error) {
        console.error("Error deleting student:", error);
        alert('Error al eliminar alumno.');
    }
}

// --- Funciones auxiliares ---

// NUEVO: funcion para obtener la fecha actual sin la hora para calculos consistentes
function getTodayDate() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // poner al inicio del dia
    return today;
}

// MODIFICADO: funcion para calcular el estado de pago del estudiante mas preciso
function getStudentPaymentStatus(student) {
    const startDate = new Date(student.startDate);
    const today = getTodayDate();
    const oneDay = 24 * 60 * 60 * 1000; // milisegundos en un dia

    // calcular el total de semanas transcurridas desde startDate hasta hoy
    const diffDays = Math.max(0, Math.floor((today - startDate) / oneDay)); // asegurar que no sean dias negativos
    let weeksElapsed = Math.floor(diffDays / 7);

    // si hay dias parciales en la semana actual, contarla como semana completa transcurrida para facturacion
    if (diffDays % 7 !== 0) {
        weeksElapsed++;
    }

    // manejar casos donde startDate esta en el futuro o es hoy
    if (startDate > today) {
        weeksElapsed = 0; // el estudiante aun no ha empezado
    } else if (diffDays === 0 && student.totalPaid === 0) {
        // si el estudiante empezo hoy y no pago nada, debe 1 semana
        weeksElapsed = 1;
    } else if (diffDays === 0 && student.totalPaid > 0) {
        // si el estudiante empezo hoy y pago algo, esta pagado
        weeksElapsed = 0; // o basado en el monto del pago, pero por ahora consideramos pagado para el dia 0
    }


    const owedAmount = weeksElapsed * student.weeklyAmount;
    let balance = owedAmount - student.totalPaid; // balance positivo = debe, balance negativo = credito

    let statusText = '';
    let isPaidUp = false;

    const lastPaymentDate = student.lastPaymentDate ? new Date(student.lastPaymentDate) : null;
    const daysSinceLastPayment = lastPaymentDate ? Math.floor(Math.abs(today - lastPaymentDate) / oneDay) : Infinity;


    if (balance > 0) {
        // el estudiante debe dinero
        isPaidUp = false;
        const weeksOwed = Math.ceil(balance / student.weeklyAmount);
        statusText = `Atrasado 🔴 (${weeksOwed} semana${weeksOwed !== 1 ? 's' : ''})`;
    } else if (balance <= 0) {
        // el estudiante esta al dia o tiene credito
        isPaidUp = true;
        
        // determinar el texto de status basado en el ultimo pago y balance
        if (balance < 0) {
            const weeksInCredit = Math.floor(Math.abs(balance) / student.weeklyAmount);
            if (weeksInCredit > 0) {
                 statusText = `Pagado Adelantado ✅ (${weeksInCredit} semana${weeksInCredit !== 1 ? 's' : ''})`;
            } else {
                statusText = 'Al Día ✅'; // balance negativo pequeño, no alcanza para una semana completa de credito
            }
        } else { // balance es 0
            statusText = 'Al Día ✅';
        }

        // agregar advertencia "Revisar" si el ultimo pago es antiguo, aunque el balance este bien xd
        // este umbral puede necesitar ajustes segun cuando esperes los pagos
        // por ejemplo, si se esperan pagos semanales, mas de 7 dias sin pagar es una señal
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


// funcion para renderizar estudiantes en la lista principal
function renderStudents() {
    // IMPORTANTE: asegurate de que este ID coincida con tu HTML (del paso anterior: 'studentList' o 'studentsGrid')
    const studentListDiv = document.getElementById('studentList') || document.getElementById('studentsGrid'); 
    if (!studentListDiv) {
        console.error("Element with ID 'studentList' or 'studentsGrid' not found.");
        return;
    }
    studentListDiv.innerHTML = ''; // limpiar la lista actual

    let paidCount = 0;
    let unpaidCount = 0;
    let totalCollected = 0;

    const currentSearchTerm = document.getElementById('searchInput').value.toLowerCase();

    students.forEach(student => {
        const status = getStudentPaymentStatus(student);

        // logica para contar pagados/no pagados. un estudiante con balance <= 0 se considera al dia
        if (status.balance <= 0) { // chequear el balance directamente
            paidCount++;
        } else {
            unpaidCount++;
        }
        totalCollected += student.totalPaid; // sumando el totalPaid de cada estudiante

        // filtrar estudiantes basado en el input de busqueda
        if (currentSearchTerm && !student.name.toLowerCase().includes(currentSearchTerm)) {
            return; // saltar si no coincide con el termino de busqueda
        }

        const statusText = status.statusText;

        const studentDiv = document.createElement('div');
        // aplicar la clase 'paid' si el balance no es positivo (al dia o con credito)
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

    // actualizar las tarjetas de estadisticas
    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('paidStudents').textContent = paidCount;
    document.getElementById('unpaidStudents').textContent = unpaidCount;
    document.getElementById('totalCollected').textContent = `$${totalCollected.toFixed(2)}`;
}

// funcion para manejar la busqueda de estudiantes
function searchStudents() {
    renderStudents(); // re-renderizar para aplicar el filtro de busqueda
}

// --- Funciones del modal de administrador ---
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
    document.getElementById('adminPassword').value = ''; // limpiar el campo de contraseña
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
    closeAdminModal(); // cerrar el modal al hacer logout
}

// funcion para manejar agregar un nuevo estudiante
async function addStudent() {
    const studentNameInput = document.getElementById('studentName');
    const name = studentNameInput.value.trim();

    if (!name) {
        alert('Por favor, ingresa el nombre del alumno.');
        return;
    }

    const newStudent = {
        name: name,
        grade: "Estudiante", // grado por defecto
        weeklyAmount: 2.00, // monto semanal por defecto
        startDate: new Date().toISOString().split('T')[0], // fecha actual como fecha de inicio
        totalPaid: 0.00,
        paymentHistory: [],
        lastPaymentDate: null
    };

    await addStudentToServer(newStudent);
    studentNameInput.value = ''; // limpiar el input
}


// funcion para renderizar estudiantes en la lista de eliminacion del panel de admin
function renderAdminStudentsList() {
    const list = document.getElementById('adminStudentsList');
    if (!list) {
        console.error("Element with ID 'adminStudentsList' not found.");
        return;
    }
    list.innerHTML = '';
    students.forEach(student => {
        const status = getStudentPaymentStatus(student); // obtener status para mostrar
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

// funcion para poblar el dropdown de seleccion de estudiantes para pagos
function updatePaymentStudentSelect() {
    const select = document.getElementById('paymentStudent');
    if (!select) {
        console.error("Element with ID 'paymentStudent' not found.");
        return;
    }
    select.innerHTML = '<option value="">Seleccione un alumno...</option>'; // limpiar y agregar opcion por defecto
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = student.name;
        select.appendChild(option);
    });
}

// funcion para registrar un pago
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
        timestamp: new Date().toISOString() // registrar el momento del pago
    };

    await registerPaymentToServer(parseInt(studentId), payment);

    // limpiar los campos del formulario despues de registrar exitosamente
    document.getElementById('paymentStudent').value = '';
    document.getElementById('paymentAmountInput').value = '2.00'; // resetear al valor por defecto
    document.getElementById('paymentDate').value = '';
}

// ya no es estrictamente necesario porque renderStudents() maneja la actualizacion completa
// function updateStudentPaymentStatus(updatedStudent) { }


async function deleteStudent(studentId) {
    if (confirm('¿Está seguro de eliminar este alumno? Esta acción no se puede deshacer.')) {
        await deleteStudentFromServer(studentId);
    }
}

// event listeners xd
document.addEventListener('DOMContentLoaded', () => {
    // solo agregar listeners si los elementos existen
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

    // cerrar modal al hacer clic fuera
    window.onclick = function(event) {
        const modal = document.getElementById('adminModal');
        if (modal && event.target === modal) {
            closeAdminModal();
        }
    }

    // inicializar la aplicacion y cargar estudiantes desde el servidor al arrancar
    fetchStudents();
});
