grammar Edict;

tokens { WHEN_NL }

document
    : NL* (languageDeclaration NL+)? kind=ID STRING objectOpen (authorityItem NL+)* authorityItem? '}' NL* EOF
    ;

languageDeclaration
    : 'language' STRING
    ;

authorityItem
    : property
    | configDeclaration
    | inputDeclaration
    | dataStructDeclaration
    | approverDeclaration
    | extensionDeclaration
    | binding
    | functionDeclaration
    | policyDeclaration
    ;

property
    : ID '=' NL* expression
    ;

configDeclaration
    : 'config' recordLiteral
    ;

inputDeclaration
    : 'input' ID (':' typeReference | objectOpen (inputField NL+)* inputField? '}')
    ;

dataStructDeclaration
    : 'struct' ID objectOpen (inputField NL+)* inputField? '}'
    ;

approverDeclaration
    : 'approver' ID recordLiteral
    ;

extensionDeclaration
    : kind=ID name=ID ':' module=ID objectOpen (extensionItem NL+)* extensionItem? '}'
    ;

extensionItem
    : property
    | signatureDeclaration
    | structDeclaration
    ;

structDeclaration
    : 'struct' memberName objectOpen (wireParameter NL+)* wireParameter? '}'
    ;

signatureDeclaration
    : 'fn' memberName '(' (wireParameter (',' wireParameter)*)? ')' (':' wireType)? recordLiteral?
    ;

wireParameter
    : memberName ':' wireType
    ;

wireType
    : qualifiedName ('<' wireType (',' wireType)* '>')? ('[' NUMBER? ']')* '?'?
    ;

inputField
    : memberName ':' typeReference ('=' NL* expression)?
    ;

typeReference
    : qualifiedName ('<' typeReference (',' typeReference)* '>')? '?'?
    ;

qualifiedName
    : ID ('.' memberName)*
    ;

memberName
    : ID | ESCAPED_ID
    ;

functionDeclaration
    : 'fn' ID '(' NL* (parameter (NL* ',' NL* parameter)*)? NL* ')' (':' typeReference)? NL* block
    ;

parameter
    : ID (':' typeReference)?
    ;

policyDeclaration
    : 'policy' STRING objectOpen (policyItem NL+)* policyItem? '}'
    ;

policyItem
    : binding
    | decisionRule
    | requirementRule
    | defaultRule
    ;

decisionRule
    : effect=('allow' | 'deny') STRING? condition
    ;

requirementRule
    : 'require' requirement condition?
    ;

requirement
    : (NUMBER 'of')? expression
    ;

defaultRule
    : 'default' effect=('allow' | 'deny') ('require' requirement)?
    ;

condition
    : 'if' '(' NL* expression NL* ')'
    | whenExpression
    ;

binding
    : kind=('let' | 'var') ID (':' typeReference)? '=' NL* expression
    ;

block
    : objectOpen (statement NL+)* statement? '}'
    ;

statement
    : binding
    | assignment
    | returnStatement
    | ifStatement
    | forStatement
    ;

assignment
    : ID op=('=' | '+=' | '-=') NL* expression
    ;

returnStatement
    : 'return' expression
    ;

ifStatement
    : 'if' '(' NL* expression NL* ')' NL* block (NL* 'else' NL* (ifStatement | block))?
    ;

forStatement
    : 'for' '(' ID 'in' expression ')' NL* block
    ;

objectOpen
    : '{' NL*
    ;

expression
    : ID '->' NL* expression # lambdaExpression
    | orExpression # valueExpression
    ;

orExpression
    : andExpression ('or' NL* andExpression)*
    ;

andExpression
    : comparison ('and' NL* comparison)*
    ;

comparison
    : addition (comparisonOperator NL* addition)*
    ;

comparisonOperator
    : '=='
    | '!='
    | '<='
    | '>='
    | '<'
    | '>'
    | 'in'
    | 'not' 'in'
    ;

addition
    : multiplication (('+' | '-') NL* multiplication)*
    ;

multiplication
    : unary (('*' | '/' | '%') NL* unary)*
    ;

unary
    : (('not' | '-' | '+') NL*)* postfix
    ;

postfix
    : primary suffix*
    ;

suffix
    : (NL | WHEN_NL)* '.' memberName # memberSuffix
    | '(' NL* argumentList? NL* ')' # callSuffix
    | '[' NL* expression NL* ']' # indexSuffix
    ;

argumentList
    : expression (NL* ',' NL* expression)*
    ;

primary
    : NUMBER # numberLiteral
    | STRING # textLiteral
    | value=('true' | 'false' | 'null') # scalarLiteral
    | ID # nameExpression
    | '(' NL* expression NL* ')' # parenthesizedExpression
    | listLiteral # listExpression
    | recordLiteral # objectExpression
    | whenExpression # conjunctionExpression
    ;

listLiteral
    : '[' NL* (expression (NL* ',' NL* expression)* NL* ','?)? NL* ']'
    ;

recordLiteral
    : objectOpen (recordField ((NL | ',')+ recordField)* (NL | ',')*)? '}'
    ;

recordField
    : (ID | STRING) (':' | '=') NL* expression
    ;

whenExpression
    : 'when' '{' WHEN_NL* expression (WHEN_NL+ expression)* WHEN_NL* '}'
    ;

NUMBER
    : [0-9]+ ('.' [0-9]+)?
    ;

STRING
    : '"' (ESCAPE | ~["\\\r\n])* '"'
    ;

fragment ESCAPE
    : '\\' (["\\/bfnrt] | 'u' HEX HEX HEX HEX)
    ;

fragment HEX: [0-9a-fA-F];

ID
    : [a-zA-Z_] [a-zA-Z_0-9]*
    ;

ESCAPED_ID
    : '`' [a-zA-Z_] [a-zA-Z_0-9]* '`'
    ;

NL
    : '\r'? '\n'
    ;

SPACE
    : [ \t]+ -> skip
    ;

COMMENT
    : '//' ~[\r\n]* -> skip
    ;
