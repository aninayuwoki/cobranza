import json
from flask import Flask, render_template, request, jsonify, send_file
import os
from datetime import datetime, timedelta # Ensured timedelta is imported
# from student_utils import validate_student_data, calculate_payment_status # Removed
import io
import pandas as pd
# import math # Math import no longer needed for the new calculate_payment_status

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

# --- Utility Functions defined in app.py ---
def validate_student_data(data):
    required_fields = ['name']
    for field in required_fields:
        if field not in data or not str(data[field]).strip():
            return f"Campo requerido: {field}" # Return message directly

    if 'weeklyAmount' in data:
        try:
            if float(data['weeklyAmount']) < 0:
                return "El monto semanal (weeklyAmount) debe ser un número positivo."
        except ValueError:
            return "El monto semanal (weeklyAmount) debe ser un número válido."

    if 'startDate' in data and data['startDate']: # Check if startDate is not empty
        try:
            datetime.strptime(data['startDate'], '%Y-%m-%d')
        except ValueError:
            return "La fecha de inicio (startDate) no tiene un formato válido (YYYY-MM-DD)."
    elif 'startDate' in data and not data['startDate']: # Handle empty startDate if it's a required part of validation
            return "La fecha de inicio (startDate) no puede estar vacía."

    return None # Return None if validation passes

def calculate_payment_status(student):
    # Default values for return dictionary, useful for early exits
    # Retain original fields for compatibility where possible, add new ones.
    default_status = {
        'weeks_elapsed': 0,
        'expected_amount': 0, # Will not be directly calculated in the new model this way
        'balance': 0, # Will not be directly calculated in the new model this way
        'is_current': False,
        'weeks_delinquent': 0, # Legacy, maps to new semanas_faltantes
        'semanas_pagadas': 0,
        'semanas_faltantes': 0,
        'total_paid_actual': student.get('totalPaid', 0.0), # Actual sum of all payments
        'weekly_amount': student.get('weeklyAmount', 0.0),
        'status_text': "Error en datos de estudiante",
        'status_color': '#e74c3c' # Error color
    }

    if not student.get('startDate'):
        default_status['status_text'] = "Fecha de inicio no definida"
        default_status['is_current'] = True # Or False, based on desired strictness
        default_status['status_color'] = '#bdc3c7' # Neutral
        return default_status

    try:
        start_date_obj = datetime.strptime(student['startDate'], '%Y-%m-%d').date()
    except ValueError:
        default_status['status_text'] = "Formato de fecha de inicio inválido"
        return default_status

    student_weekly_amount = student.get('weeklyAmount', 0.0)
    if not isinstance(student_weekly_amount, (int, float)) or student_weekly_amount <= 0:
        default_status['status_text'] = "Monto semanal inválido o no positivo"
        # weekly_amount in default_status already reflects student.get('weeklyAmount')
        return default_status
    student_weekly_amount = float(student_weekly_amount)
    default_status['weekly_amount'] = student_weekly_amount


    today = datetime.now().date()

    # Process payment history to ensure dates are date objects and amounts are floats
    valid_payment_history = []
    raw_payments = student.get('paymentHistory', [])
    for p_entry in raw_payments:
        try:
            if isinstance(p_entry, dict) and 'date' in p_entry and 'amount' in p_entry:
                payment_date_obj = datetime.strptime(p_entry['date'], '%Y-%m-%d').date()
                payment_amount_val = float(p_entry['amount'])
                if payment_amount_val > 0: # Only consider positive payments for covering weeks
                    valid_payment_history.append({'date': payment_date_obj, 'amount': payment_amount_val})
        except (ValueError, TypeError):
            continue # Skip malformed payment entries

    # Sort payments by date to process them chronologically if needed, though current logic sums by week window
    # payment_history_sorted = sorted(valid_payment_history, key=lambda p: p['date'])

    current_semanas_pagadas = 0
    current_semanas_faltantes = 0
    current_weeks_elapsed = 0

    overall_status_text = "Al día ✅"
    overall_status_color = '#27ae60'
    overall_is_current = True

    if start_date_obj > today: # Start date is in the future
        overall_status_text = "No iniciado (Al día) ✅"
        # All counts (elapsed, pagadas, faltantes) remain 0
    else:
        billable_week_start_date = start_date_obj
        while billable_week_start_date <= today:
            current_weeks_elapsed += 1
            billable_week_end_date = billable_week_start_date + timedelta(days=6)

            amount_paid_for_this_billable_week = 0.0
            # Sum all payments that fall within this billable week
            for payment in valid_payment_history:
                if billable_week_start_date <= payment['date'] <= billable_week_end_date:
                    amount_paid_for_this_billable_week += payment['amount']

            if amount_paid_for_this_billable_week >= student_weekly_amount:
                current_semanas_pagadas += 1
            else:
                current_semanas_faltantes += 1 # This week's $2 obligation was not met

            billable_week_start_date += timedelta(days=7)

        if current_semanas_faltantes > 0:
            overall_status_text = f"Atrasado {current_semanas_faltantes} semana(s) 🔴"
            overall_status_color = '#e74c3c'
            overall_is_current = False
        elif current_weeks_elapsed == 0 and start_date_obj <= today : # Started today, no full weeks elapsed yet
             # If the first week (current_weeks_elapsed would be 1 after loop) is not paid, faltantes will be 1.
             # This case might be redundant if loop handles it.
             pass


    # Update the default_status with calculated values
    default_status.update({
        'weeks_elapsed': current_weeks_elapsed,
        'semanas_pagadas': current_semanas_pagadas,
        'semanas_faltantes': current_semanas_faltantes,
        'weeks_delinquent': current_semanas_faltantes, # For compatibility if old key is used
        'status_text': overall_status_text,
        'status_color': overall_status_color,
        'is_current': overall_is_current,
        # 'expected_amount' and 'balance' under the old model are not directly applicable here.
        # If needed, 'expected_amount_for_elapsed_weeks' could be current_weeks_elapsed * student_weekly_amount.
        # A new 'financial_balance' could be student.get('totalPaid',0) - (current_weeks_elapsed * student_weekly_amount).
        # For now, focusing on SP/SF as per user's direct examples.
        'expected_amount': round(current_weeks_elapsed * student_weekly_amount, 2), # Calculated for reference
        'balance': round(student.get('totalPaid', 0.0) - (current_weeks_elapsed * student_weekly_amount), 2) # Calculated for reference

    })
    return default_status

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