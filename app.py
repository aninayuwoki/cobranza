import json
from flask import Flask, render_template, request, jsonify, send_file
import os
from datetime import datetime
from student_utils import validate_student_data, calculate_payment_status
import io
import pandas as pd

app = Flask(__name__, static_folder='static', template_folder='templates')

DATA_FILE = 'students.json'

# --- Helper functions to manage JSON data ---
def load_students_data():
    """
    Loads student data from the JSON file.
    Initializes the file if it doesn't exist or is empty/corrupted.
    Ensures essential fields exist for each student.
    """
    if not os.path.exists(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
        # Initialize with an empty list if file doesn't exist or is empty
        with open(DATA_FILE, 'w') as f:
            json.dump([], f)
        return []
    
    with open(DATA_FILE, 'r') as f:
        try:
            data = json.load(f)
            # Ensure data is a list; if not, re-initialize
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
        
        # Ensure default values for existing students if they don't have them
        for student in data:
            if 'grade' not in student:
                student['grade'] = "Estudiante"
            if 'weeklyAmount' not in student:
                student['weeklyAmount'] = 2.00 # Default weekly amount if missing
            if 'startDate' not in student:
                student['startDate'] = datetime.now().isoformat().split('T')[0] # Default to today if missing
            if 'totalPaid' not in student:
                student['totalPaid'] = sum(p.get('amount', 0) for p in student.get('paymentHistory', []))
            if 'paymentHistory' not in student:
                student['paymentHistory'] = []
            if 'lastPaymentDate' not in student:
                # Find last payment date from history or set to None
                if student['paymentHistory']:
                    student['lastPaymentDate'] = max(p.get('date', '') for p in student['paymentHistory'] if p.get('date'))
                    # If max returns an empty string or None, set to None
                    if not student['lastPaymentDate']:
                        student['lastPaymentDate'] = None
                else:
                    student['lastPaymentDate'] = None
        return data


def save_students_data(data):
    """Saves student data to the JSON file."""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# --- Flask Routes ---

@app.route('/')
def index():
    """Renders the main index page."""
    return render_template('index.html')

@app.route('/api/students', methods=['GET'])
def get_students():
    """Returns the list of all students."""
    students = load_students_data()
    for student in students:
        student['paymentStatus'] = calculate_payment_status(student)
    return jsonify(students)

@app.route('/api/students', methods=['POST'])
def add_student():
    """Adds a new student to the system."""
    students = load_students_data()
    new_student_data = request.json

    # Validate student data
    error_message = validate_student_data(new_student_data)
    if error_message:
        return jsonify({'message': error_message}), 400
    
    # Generate a new ID (find max ID and add 1, or start from 1 if no students)
    if students:
        new_id = max(s['id'] for s in students) + 1
    else:
        new_id = 1
        
    # Set default values for new student if not provided
    new_student_data['id'] = new_id
    new_student_data['grade'] = new_student_data.get('grade', "Estudiante")
    new_student_data['weeklyAmount'] = new_student_data.get('weeklyAmount', 2.00)
    new_student_data['startDate'] = new_student_data.get('startDate', datetime.now().isoformat().split('T')[0])
    new_student_data['totalPaid'] = new_student_data.get('totalPaid', 0.00)
    new_student_data['paymentHistory'] = new_student_data.get('paymentHistory', [])
    new_student_data['lastPaymentDate'] = new_student_data.get('lastPaymentDate', None)

    # Calculate initial payment status
    new_student_data['paymentStatus'] = calculate_payment_status(new_student_data)

    students.append(new_student_data)
    save_students_data(students)
    return jsonify(new_student_data), 201 # 201 Created

@app.route('/api/students/<int:student_id>', methods=['PUT'])
def update_student(student_id): # Renamed
    """Updates a student's information, handling both payments and general data edits."""
    students = load_students_data()
    data_from_request = request.json
    
    student_to_update_index = -1
    for i, s in enumerate(students):
        if s['id'] == student_id:
            student_to_update_index = i
            break

    if student_to_update_index == -1:
        return jsonify({'message': 'Student not found'}), 404

    student = students[student_to_update_index]

    if 'payment' in data_from_request:
        # Payment registration logic
        payment = data_from_request['payment']

        # Basic validation for payment data
        if not isinstance(payment.get('amount'), (int, float)) or payment['amount'] <= 0:
            return jsonify({'message': 'Invalid payment amount.'}), 400
        if not payment.get('date'): # Basic check for date presence
            return jsonify({'message': 'Payment date is required.'}), 400
        try:
            datetime.fromisoformat(payment['date'].split('T')[0]) # Validate date format
        except ValueError:
            return jsonify({'message': 'Invalid payment date format. Use YYYY-MM-DD.'}), 400

        if 'paymentHistory' not in student:
            student['paymentHistory'] = []
        student['paymentHistory'].append(payment)

        if 'totalPaid' not in student:
            student['totalPaid'] = 0.0
        student['totalPaid'] = round(student['totalPaid'] + payment['amount'], 2)
        student['lastPaymentDate'] = payment['date']
    else:
        # General student data editing logic
        # Validate the incoming data for editing (ensure it contains necessary fields for validation)
        # We create a temporary student object with updated fields for validation,
        # preserving fields not being edited from the original student data.
        temp_student_for_validation = student.copy()
        temp_student_for_validation.update(data_from_request)

        error_message = validate_student_data(temp_student_for_validation)
        if error_message:
            return jsonify({'message': error_message}), 400

        # Update student fields from data_from_request if they exist
        # This allows partial updates if desired, but validation expects a complete object.
        # For now, frontend should send the full object as per subtask description.
        student['name'] = data_from_request.get('name', student['name'])
        student['grade'] = data_from_request.get('grade', student['grade'])
        student['weeklyAmount'] = data_from_request.get('weeklyAmount', student['weeklyAmount'])
        student['startDate'] = data_from_request.get('startDate', student['startDate'])
        # Note: 'id', 'totalPaid', 'paymentHistory', 'lastPaymentDate' should not be directly editable here.

    # Recalculate payment status in both cases (payment or edit)
    student['paymentStatus'] = calculate_payment_status(student)

    students[student_to_update_index] = student # Update the student in the list
    save_students_data(students)
    return jsonify(student)

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    """Deletes a student from the system."""
    students = load_students_data()
    initial_len = len(students)
    students = [s for s in students if s['id'] != student_id]
    if len(students) < initial_len:
        save_students_data(students)
        return jsonify({'message': 'Student deleted successfully'})
    return jsonify({'message': 'Student not found'}), 404

@app.route('/api/students/export/excel', methods=['GET'])
def export_students_excel():
    students = load_students_data()
    data_for_df = []

    for student_data in students: # Renamed student to student_data to avoid conflict with student var in loop
        # Ensure paymentStatus is calculated for each student
        # The calculate_payment_status function in student_utils.py returns a dict with:
        # weeks_elapsed, expected_amount, balance, is_current, weeks_delinquent, status_color, status_text
        # Let's use the keys as returned by that function.
        # The subtask description used weeks_behind, which was weeks_delinquent in student_utils.py

        # First, ensure 'paymentStatus' key exists or calculate it
        if 'paymentStatus' not in student_data or not isinstance(student_data['paymentStatus'], dict):
             student_data['paymentStatus'] = calculate_payment_status(student_data)

        status = student_data['paymentStatus']


        data_for_df.append({
            'ID': student_data.get('id'),
            'Nombre': student_data.get('name'),
            'Grado/Curso': student_data.get('grade'),
            'Fecha de Inicio': student_data.get('startDate'),
            'Monto Semanal': student_data.get('weeklyAmount'),
            'Total Pagado': student_data.get('totalPaid'),
            'Monto Esperado': status.get('expected_amount'), # Matched to student_utils
            'Balance': status.get('balance'), # Matched to student_utils
            'Semanas Transcurridas': status.get('weeks_elapsed'), # Matched to student_utils
            'Semanas de Atraso': status.get('weeks_delinquent'), # Matched to student_utils (was weeks_behind)
            'Estado del Pago': status.get('status_text'), # Matched to student_utils
            'Fecha Último Pago': student_data.get('lastPaymentDate', 'N/A')
        })

    df = pd.DataFrame(data_for_df)

    output = io.BytesIO()
    # Using try-except for writer close/save for openpyxl version compatibility
    try:
        writer = pd.ExcelWriter(output, engine='openpyxl')
        df.to_excel(writer, sheet_name='Estudiantes', index=False)
        writer.close() # Recommended for openpyxl >= 3.0
    except Exception: # Fallback for older versions or other issues
        output.seek(0) # Reset stream position
        writer = pd.ExcelWriter(output, engine='openpyxl')
        df.to_excel(writer, sheet_name='Estudiantes', index=False)
        writer.save() # Used in older openpyxl

    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='reporte_estudiantes.xlsx'
    )

if __name__ == '__main__':
    # Ensure students.json exists and is valid on startup, and has default fields
    load_students_data() 
    app.run(debug=True) # debug=True allows for automatic reloading on code changes