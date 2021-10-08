const multisend_abi = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "_receivers",
				"type": "address[]"
			},
			{
				"internalType": "uint256",
				"name": "_amount",
				"type": "uint256"
			}
		],
		"name": "sendmultiple",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]

export { multisend_abi };