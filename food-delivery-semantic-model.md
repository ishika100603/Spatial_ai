# Food Delivery — Semantic Model

A simple semantic model of a food delivery system, made of three entities, two relationships, two rules and four actions.

## Diagram

```
Delivery Partner ──── Drives to ────► Restaurant ◄──── Partner with ──── UberEats
```

## Entities

### Delivery Partner
| Attribute    | Description                     | Example values      |
|--------------|---------------------------------|---------------------|
| Rating       | Partner's customer rating       | 4.8 / 5             |
| Commute type | How the partner travels         | Car, Bike           |
| Tips         | Tips the partner has earned     | $12.50              |

### Restaurant
| Attribute    | Description                     | Example values                          |
|--------------|---------------------------------|-----------------------------------------|
| Cuisine type | Kind of food served             | Asian, Thai, Indian, Chinese, …         |
| Store type   | Kind of establishment           | Food Truck, Fine Dining, …              |

### UberEats
| Attribute      | Description                          | Example values             |
|----------------|--------------------------------------|----------------------------|
| Service charge | Fee charged for the delivery service | $3.99                      |
| Route          | Path from restaurant to customer     | Restaurant → Customer      |
| Delivery time  | Estimated time to deliver            | 30 min                     |
| Membership     | Customer's membership tier           | Standard, Uber One         |

## Relationships

| From             | Relationship | To         | Meaning                                              |
|------------------|--------------|------------|------------------------------------------------------|
| Delivery Partner | Drives to    | Restaurant | The partner drives to the restaurant to pick up an order |
| UberEats         | Partner with | Restaurant | UberEats partners with the restaurant to deliver its food |

## Rules

1. **Confidentiality of the customer's details** — each entity only sees the customer information it needs. A delivery partner gets the delivery address, instructions and order number, but not payment details or account history.
2. **Delivery time** — every active order must have an estimated delivery time, and it is updated as the order moves forward.

## Actions

| Action                     | What happens                                                        |
|----------------------------|---------------------------------------------------------------------|
| Receiving payment          | The customer's payment for an order is processed (details kept private) |
| Receiving orders           | The restaurant receives a new order from a customer                 |
| Chatbots / assistance      | Customers can ask about order status, delivery time, etc.           |
| Profile / account creation | Customers create an account (name, email, phone, membership)        |
