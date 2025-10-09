import json
from flask import Flask, render_template, request, jsonify
import os
from datetime import datetime

app = Flask(__name__, static_folder='static', template_folder='templates')

DATA_FILE = 'students.json'

# --- Aqui estan las funciones auxiliares para gestionar datos del JSON ---
def load_students_data():
    """
    Carga los datos de los estudiantes desde el archivo JSON.
    Inicializa el archivo si no existe o está vacío/corrupto.
    Se asegura de que existan los campos esenciales para cada estudiante.
    """
    if not os.path.exists(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
       # La lista empieza vacia si el archivo no existe o esta vacio
        with open(DATA_FILE, 'w') as f:
            json.dump([], f)
        return []
    
    with open(DATA_FILE, 'r') as f:
        try:
            data = json.load(f)
            # comprueba que los datos sean una lista. si no, reinicializar
            if not isinstance(data, list):
                print(f"Warning: {DATA_FILE} content is not a list. Initializing with empty list.")
                with open(DATA_FILE, 'w') as f_write:
                    json.dump([], f_write)
                return []

        except json.JSONDecodeError:
            print(f"Error: Could not decode JSON from {DATA_FILE}. Initializing with empty list.")
            with open(DATA_FILE, 'w') as f_write:
                json.dump([], f_write)
            return []
        
        # valores predeterminados para los estudiantes existentes si no los tienen
        for student in data:
            if 'grade' not in student:
                student['grade'] = "Estudiante"
            if 'weeklyAmount' not in student:
                student['weeklyAmount'] = 2.00 # cobro semanal predeterminado si no se define xd
            if 'startDate' not in student:
                student['startDate'] = datetime.now().isoformat().split('T')[0] # Predeterminado si falta hoy
            if 'totalPaid' not in student:
                student['totalPaid'] = sum(p.get('amount', 0) for p in student.get('paymentHistory', []))
            if 'paymentHistory' not in student:
                student['paymentHistory'] = []
            if 'lastPaymentDate' not in student:
                # buscar la ultima fecha de pago del historial o poner None si no hay
                if student['paymentHistory']:
                    student['lastPaymentDate'] = max(p.get('date', '') for p in student['paymentHistory'] if p.get('date'))
                    # si max devuelve string vacio o None, poner None
                    if not student['lastPaymentDate']:
                        student['lastPaymentDate'] = None
                else:
                    student['lastPaymentDate'] = None
        return data


def save_students_data(data):
    """Guarda los datos de estudiantes en el archivo JSON."""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# --- Flask Routes ---

@app.route('/')
def index():
    """Renderiza la pagina principal index."""
    return render_template('index.html')

@app.route('/api/students', methods=['GET'])
def get_students():
    """Devuelve la lista de todos los estudiantes."""
    students = load_students_data()
    return jsonify(students)

@app.route('/api/students', methods=['POST'])
def add_student():
    """Agrega un nuevo estudiante al sistema."""
    students = load_students_data()
    new_student_data = request.json
    
    # genera un nuevo ID (busca el ID mas alto y suma 1, o empieza desde 1 si no hay estudiantes)
    if students:
        new_id = max(s['id'] for s in students) + 1
    else:
        new_id = 1
        
    # poner valores por defecto para el nuevo estudiante si no se proporcionan
    new_student_data['id'] = new_id
    new_student_data['grade'] = new_student_data.get('grade', "Estudiante")
    new_student_data['weeklyAmount'] = new_student_data.get('weeklyAmount', 2.00)
    new_student_data['startDate'] = new_student_data.get('startDate', datetime.now().isoformat().split('T')[0])
    new_student_data['totalPaid'] = new_student_data.get('totalPaid', 0.00)
    new_student_data['paymentHistory'] = new_student_data.get('paymentHistory', [])
    new_student_data['lastPaymentDate'] = new_student_data.get('lastPaymentDate', None)

    students.append(new_student_data)
    save_students_data(students)
    return jsonify(new_student_data), 201 # 201 Creados

@app.route('/api/students/<int:student_id>', methods=['PUT'])
def register_payment(student_id):
    """Actualiza la info de un estudiante, principalmente para registrar pagos."""
    students = load_students_data()
    updated_data = request.json
    
    for i, student in enumerate(students):
        if student['id'] == student_id:
            if 'payment' in updated_data:
                payment = updated_data['payment']
                # asegurarse de que paymentHistory exista
                if 'paymentHistory' not in students[i]:
                    students[i]['paymentHistory'] = []
                students[i]['paymentHistory'].append(payment)
                
                # asegurarse de que totalPaid exista antes de sumar
                if 'totalPaid' not in students[i]:
                    students[i]['totalPaid'] = 0.0
                students[i]['totalPaid'] = round(students[i]['totalPaid'] + payment['amount'], 2)
                
                students[i]['lastPaymentDate'] = payment['date']
            
            save_students_data(students)
            return jsonify(students[i])
    return jsonify({'message': 'Student not found'}), 404

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    """Elimina un estudiante del sistema."""
    students = load_students_data()
    initial_len = len(students)
    students = [s for s in students if s['id'] != student_id]
    if len(students) < initial_len:
        save_students_data(students)
        return jsonify({'message': 'Student deleted successfully'})
    return jsonify({'message': 'Student not found'}), 404

if __name__ == '__main__':
    # asegurarse de que students.json existe y es valido al iniciar, y tiene los campos por defecto
    load_students_data() 
    app.run(debug=True) # debug=True permite recarga automatica cuando cambia el codigo
